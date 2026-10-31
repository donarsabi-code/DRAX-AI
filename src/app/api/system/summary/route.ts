/**
 * Synthèse du flux utilisateur — DRAX IA Chat
 * GET /api/system/summary
 *
 * Compteurs globaux du compte connecté : conversations, messages,
 * images générées, répartition par modèle, par action.
 */

import { getCurrentUser, jsonError, unauthorized, rateLimit, tooMany } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`flux-summary:${user.id}`, 20, 60 * 1000)) return tooMany()

    const [conversations, messages, assistantMessages, imageMessages, errors, byModel, byAction] =
      await Promise.all([
        db.conversation.count({ where: { userId: user.id } }),
        db.message.count({ where: { userId: user.id } }),
        db.message.count({ where: { userId: user.id, role: 'assistant' } }),
        db.message.count({ where: { userId: user.id, role: 'assistant', model: 'lumen-image-1' } }),
        db.message.count({ where: { userId: user.id, status: 'error' } }),
        db.message.groupBy({
          by: ['model'],
          where: { userId: user.id, role: 'assistant' },
          _count: { model: true },
        }),
        db.apiEvent.groupBy({
          by: ['action'],
          where: { userId: user.id },
          _count: { action: true },
        }),
      ])

    return Response.json({
      totals: {
        conversations,
        messages,
        assistantMessages,
        imagesGenerated: imageMessages,
        errors,
      },
      byModel: byModel
        .map((m) => ({ model: m.model ?? 'inconnu', count: m._count.model }))
        .sort((a, b) => b.count - a.count),
      byAction: byAction
        .map((a) => ({ action: a.action, count: a._count.action }))
        .sort((a, b) => b.count - a.count),
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[system/summary]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
