import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, rateLimit, jsonError, unauthorized, tooMany } from '@/lib/auth-server'
import { readAttachmentFile } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * Service d'une image générée — DRAX IA Chat
 * - Authentification obligatoire à chaque requête
 * - Isolation stricte : seule la personne qui a généré l'image peut la voir
 *   (tout autre utilisateur ou invité reçoit 404 — pas de fuite d'existence)
 * - Le chemin de stockage est défini côté serveur uniquement (jamais depuis
 *   l'entrée client) → aucun risque de traversée de répertoire
 * - Type MIME whitelisté (image/png)
 */

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!rateLimit(`img-file:${user.id}`, 240, 60 * 1000)) return tooMany()

  const { id } = await params
  if (!/^[a-z0-9]+$/i.test(id)) return jsonError('Image introuvable.', 404)

  const attachment = await db.attachment.findUnique({ where: { id } })
  if (!attachment || attachment.userId !== user.id) {
    return jsonError('Image introuvable.', 404)
  }
  const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const
  if (!ALLOWED_MIMES.includes(attachment.mimeType as (typeof ALLOWED_MIMES)[number])) {
    return jsonError('Type de fichier non pris en charge.', 415)
  }

  const file = await readAttachmentFile(attachment)
  if (!file) {
    console.error('[images/file] read failed:', attachment.storagePath)
    return jsonError('Image introuvable sur le serveur.', 404)
  }
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(file.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${attachment.fileName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
