import { db } from '@/lib/db'
import {
  getCurrentUser,
  jsonError,
  unauthorized,
  rateLimit,
  tooMany,
  SESSION_COOKIE,
  sha256,
} from '@/lib/auth-server'
import { logApiEvent } from '@/lib/flux'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

/**
 * Sessions actives de l'utilisateur — DRAX IA Dashboard (onglet Sécurité).
 * - GET : liste des sessions ouvertes (la plus récente en premier).
 * - DELETE : révoque TOUTES les sessions sauf celle en cours
 *   (« Déconnecter les autres appareils »).
 */

/** Retrouve l'identifiant de session courante depuis le cookie. */
async function currentSessionId(userId: string): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(raw) },
    select: { id: true, userId: true },
  })
  return session?.userId === userId ? session.id : null
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`sessions:${user.id}`, 30, 60 * 1000)) return tooMany()

    const [sessions, currentId] = await Promise.all([
      db.session.findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, expiresAt: true },
      }),
      currentSessionId(user.id),
    ])

    return Response.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === currentId,
      })),
    })
  } catch (error) {
    console.error('[sessions GET]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`sessions-del:${user.id}`, 6, 60 * 1000)) return tooMany()

    const currentId = await currentSessionId(user.id)
    const result = await db.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentId ? { id: { not: currentId } } : {}),
      },
    })

    logApiEvent({
      route: '/api/profile/sessions',
      action: 'session.revokeOthers',
      method: 'DELETE',
      status: 200,
      startedAt: Date.now(),
      userId: user.id,
      meta: { revoked: result.count },
    })

    return Response.json({ ok: true, revoked: result.count })
  } catch (error) {
    console.error('[sessions DELETE]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
