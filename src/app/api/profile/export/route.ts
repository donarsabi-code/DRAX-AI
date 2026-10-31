import { db } from '@/lib/db'
import { getCurrentUser, jsonError, unauthorized, rateLimit, tooMany } from '@/lib/auth-server'
import { logApiEvent } from '@/lib/flux'

export const runtime = 'nodejs'

/**
 * Export complet des données personnelles (portabilité) — DRAX IA Dashboard.
 * Renvoie un fichier JSON téléchargeable contenant : profil, conversations,
 * messages, sources, journal d'activité. Seules les données de l'utilisateur
 * connecté sont incluses.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`export:${user.id}`, 5, 10 * 60 * 1000)) return tooMany()

    const [profile, conversations, messages, events] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, displayName: true, avatarUrl: true, bio: true, aiModel: true, createdAt: true },
      }),
      db.conversation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      }),
      db.message.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          conversationId: true,
          role: true,
          content: true,
          model: true,
          status: true,
          sources: true,
          createdAt: true,
        },
      }),
      db.apiEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ])

    logApiEvent({
      route: '/api/profile/export',
      action: 'profile.export',
      method: 'GET',
      status: 200,
      startedAt: Date.now(),
      userId: user.id,
      meta: { conversations: conversations.length, messages: messages.length },
    })

    const payload = {
      application: 'DRAX IA',
      exportedAt: new Date().toISOString(),
      profile,
      conversations,
      messages,
      activityLog: events.map((e) => ({
        route: e.route,
        action: e.action,
        method: e.method,
        status: e.status,
        durationMs: e.durationMs,
        meta: e.meta ? JSON.parse(e.meta) : null,
        createdAt: e.createdAt,
      })),
    }

    const date = new Date().toISOString().slice(0, 10)
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="drax-ia-export-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[export GET]', error)
    return jsonError('Erreur serveur pendant l\'export.', 500)
  }
}
