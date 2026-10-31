import { db } from '@/lib/db'
import { getCurrentUser, jsonError, unauthorized, rateLimit, tooMany } from '@/lib/auth-server'

export const runtime = 'nodejs'

/**
 * Statistiques d'utilisation personnelles — DRAX IA Dashboard.
 * Toutes les données proviennent de la BDD de l'utilisateur (messages,
 * conversations, ApiEvent). Aucune donnée d'un autre utilisateur n'est lisible.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`stats:${user.id}`, 30, 60 * 1000)) return tooMany()

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [conversations, messagesTotal, imagesTotal, searchEvents, eventsTotal, userMsgs7d, oldest, dailyRaw] =
      await Promise.all([
        db.conversation.count({ where: { userId: user.id } }),
        db.message.count({ where: { userId: user.id } }),
        db.message.count({ where: { userId: user.id, model: 'lumen-image-1', status: 'completed' } }),
        db.apiEvent.count({ where: { userId: user.id, action: 'search.web' } }),
        db.apiEvent.count({ where: { userId: user.id } }),
        db.message.count({ where: { userId: user.id, role: 'user', createdAt: { gte: since30 } } }),
        db.message.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        // Volume de messages par jour (30 derniers jours) pour la mini-courbe
        db.message.groupBy({
          by: ['createdAt'],
          where: { userId: user.id, role: 'user', createdAt: { gte: since30 } },
          _count: { id: true },
        }),
      ])

    // Regroupe par jour (date locale ISO yyyy-mm-dd)
    const byDay = new Map<string, number>()
    for (const row of dailyRaw) {
      const key = row.createdAt.toISOString().slice(0, 10)
      byDay.set(key, (byDay.get(key) ?? 0) + row._count.id)
    }
    const daily: { day: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      daily.push({ day: key, count: byDay.get(key) ?? 0 })
    }

    // Jours distincts d'activité + plus longue série consécutive (streak)
    const activeDays = [...byDay.keys()].sort()
    let streak = 0
    if (activeDays.length) {
      const set = new Set(activeDays)
      let cursor = new Date()
      cursor.setUTCHours(12, 0, 0, 0)
      // Si aujourd'hui inactif, démarre depuis hier
      if (!set.has(cursor.toISOString().slice(0, 10))) {
        cursor = new Date(cursor.getTime() - 24 * 3600 * 1000)
      }
      while (set.has(cursor.toISOString().slice(0, 10))) {
        streak++
        cursor = new Date(cursor.getTime() - 24 * 3600 * 1000)
      }
    }

    const firstMessageAt = oldest?.createdAt ?? null
    const daysSinceJoin = firstMessageAt
      ? Math.max(1, Math.ceil((Date.now() - firstMessageAt.getTime()) / (24 * 3600 * 1000)))
      : 0

    return Response.json({
      stats: {
        conversations,
        messagesTotal,
        messages30d: userMsgs7d,
        imagesGenerated: imagesTotal,
        webSearches: searchEvents,
        apiEvents: eventsTotal,
        activeDays: activeDays.length,
        streak,
        memberSince: firstMessageAt ? firstMessageAt.toISOString() : null,
        avgPerDay: daysSinceJoin ? Math.round((messagesTotal / daysSinceJoin) * 10) / 10 : 0,
        daily,
      },
    })
  } catch (error) {
    console.error('[stats GET]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
