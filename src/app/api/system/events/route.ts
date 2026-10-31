/**
 * Journal du flux de l'utilisateur — DRAX IA Chat
 * GET /api/system/events
 *
 * Renvoie les 100 dernières actions de l'UTILISATEUR CONNECTÉ uniquement
 * (aucun accès au journal d'un autre compte) + des compteurs par action.
 * C'est la consultation directe de la table ApiEvent remplie par
 * src/lib/flux.ts à chaque action de l'API.
 */

import { getCurrentUser, jsonError, unauthorized, rateLimit, tooMany } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`flux:${user.id}`, 30, 60 * 1000)) return tooMany()

    const [events, grouped] = await Promise.all([
      db.apiEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          route: true,
          action: true,
          method: true,
          status: true,
          durationMs: true,
          meta: true,
          createdAt: true,
        },
      }),
      db.apiEvent.groupBy({
        by: ['action'],
        where: { userId: user.id },
        _count: { action: true },
      }),
    ])

    return Response.json({
      events: events.map((e) => ({
        id: e.id,
        route: e.route,
        action: e.action,
        method: e.method,
        status: e.status,
        durationMs: e.durationMs,
        meta: e.meta ? (safeParse(e.meta) as Record<string, unknown> | null) : null,
        createdAt: e.createdAt.toISOString(),
      })),
      stats: grouped
        .map((g) => ({ action: g.action, count: g._count.action }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (error) {
    console.error('[system/events]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
