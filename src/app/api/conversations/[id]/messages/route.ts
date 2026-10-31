import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, unauthorized, jsonError } from '@/lib/auth-server'

type Params = { params: Promise<{ id: string }> }

/** Messages d'une conversation (isolation par userId). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const { id } = await params
    const conversation = await db.conversation.findFirst({
      where: { id, userId: user.id },
    })
    if (!conversation) return jsonError('Conversation introuvable.', 404)

    const messages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        role: true,
        content: true,
        model: true,
        status: true,
        errorType: true,
        sources: true,
        createdAt: true,
      },
    })

    return Response.json({
      conversation: { id: conversation.id, title: conversation.title },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        status: m.status,
        errorType: m.errorType,
        sources: m.sources ? JSON.parse(m.sources) : null,
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    console.error('[messages GET]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
