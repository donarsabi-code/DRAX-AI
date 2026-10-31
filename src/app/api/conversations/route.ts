import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeText, unauthorized, rateLimit, tooMany, jsonError } from '@/lib/auth-server'

/** Liste des conversations de l'utilisateur connecté (isolation garantie par userId). */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const conversations = await db.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true },
        },
        _count: { select: { messages: true } },
      },
    })

    return Response.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
        preview: c.messages[0]?.content?.slice(0, 120) ?? null,
      })),
    })
  } catch (error) {
    console.error('[conversations GET]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

const createSchema = z.object({
  title: z.string().max(120).optional(),
})

/** Création d'une nouvelle conversation. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`conv-create:${user.id}`, 30, 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => ({}))
    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) return jsonError('Données invalides.', 400)

    const conversation = await db.conversation.create({
      data: {
        userId: user.id,
        title: parsed.data.title ? sanitizeText(parsed.data.title, 120) : 'Nouvelle conversation',
      },
    })

    return Response.json(
      {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messageCount: 0,
          preview: null,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[conversations POST]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
