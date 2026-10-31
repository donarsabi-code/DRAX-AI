import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, jsonError, unauthorized, rateLimit, tooMany } from '@/lib/auth-server'
import { logEventSafe } from '@/lib/avatar-helpers'
import { storeAvatar, readAvatar, deleteAvatar } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * Avatar utilisateur — DRAX IA
 * - POST : upload multipart (image redimensionnée côté client en 256×256 PNG,
 *   ≤ 600 Ko). Le fichier est stocké HORS du dossier public (var/avatars),
 *   servi uniquement au propriétaire via GET — isolation stricte.
 * - GET  : sert l'avatar de l'utilisateur connecté (aucun accès inter-comptes).
 *   L'URL publique persistée dans User.avatarUrl est « /api/profile/avatar ».
 * - DELETE : retire l'avatar (fichier supprimé + avatarUrl remis à null).
 */

const MAX_BYTES = 600 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']
const EXT: Record<string, 'png' | 'jpg' | 'webp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`avatar-post:${user.id}`, 10, 60 * 1000)) return tooMany()

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) return jsonError('Aucun fichier reçu.', 400)
    if (!ALLOWED.includes(file.type)) return jsonError('Format non pris en charge (PNG, JPEG ou WebP).', 415)
    if (file.size > MAX_BYTES) return jsonError('Image trop lourde (600 Ko maximum).', 413)

    const bytes = Buffer.from(await file.arrayBuffer())
    try {
      await storeAvatar(user.id, bytes, EXT[file.type])
    } catch (storeError) {
      const message = storeError instanceof Error ? storeError.message : undefined
      return jsonError(message ?? "Erreur pendant l'enregistrement de l'avatar.", 500)
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: '/api/profile/avatar' },
      select: { id: true, email: true, displayName: true, avatarUrl: true, bio: true, aiModel: true, installGuideDismissed: true },
    })

    logEventSafe('profile.avatar.upload', user.id, '/api/profile/avatar', 'POST', 200, { size: file.size })

    const res = Response.json({ ok: true, user: updated })
    // Cache contourné pour que l'UI affiche immédiatement le nouvel avatar
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error) {
    console.error('[avatar POST]', error)
    return jsonError('Erreur serveur pendant l\'envoi de l\'avatar.', 500)
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`avatar-get:${user.id}`, 240, 60 * 1000)) return tooMany()

    const found = await readAvatar(user.id)
    if (found) {
      return new Response(new Uint8Array(found.bytes), {
        headers: {
          'Content-Type': found.mime,
          'Cache-Control': 'private, max-age=60',
        },
      })
    }
    return jsonError('Avatar introuvable.', 404)
  } catch (error) {
    console.error('[avatar GET]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`avatar-del:${user.id}`, 10, 60 * 1000)) return tooMany()

    await deleteAvatar(user.id)
    const updated = await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
      select: { id: true, email: true, displayName: true, avatarUrl: true, bio: true, aiModel: true, installGuideDismissed: true },
    })
    logEventSafe('profile.avatar.delete', user.id, '/api/profile/avatar', 'DELETE', 200, {})
    return Response.json({ ok: true, user: updated })
  } catch (error) {
    console.error('[avatar DELETE]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
