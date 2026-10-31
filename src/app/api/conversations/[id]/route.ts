import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeText, unauthorized, rateLimit, tooMany, jsonError } from '@/lib/auth-server'

type Params = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  title: z.string().trim().min(1, 'Le titre ne peut pas être vide.').max(120),
})

/**
 * Vérifie que la conversation appartient bien à l'utilisateur connecté.
 * Toutes les routes [id] passent par ce contrôle (isolation des données).
 */
async function ownedConversation(conversationId: string, userId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, userId },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`conv-patch:${user.id}`, 60, 60 * 1000)) return tooMany()

    const { id } = await params
    const conversation = await ownedConversation(id, user.id)
    if (!conversation) return jsonError('Conversation introuvable.', 404)

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Titre invalide.', 400)

    const updated = await db.conversation.update({
      where: { id: conversation.id },
      data: { title: sanitizeText(parsed.data.title, 120) },
    })
    return Response.json({
      conversation: {
        id: updated.id,
        title: updated.title,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    })
  } catch (error) {
    console.error('[conversation PATCH]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`conv-delete:${user.id}`, 60, 60 * 1000)) return tooMany()

    const { id } = await params
    const conversation = await ownedConversation(id, user.id)
    if (!conversation) return jsonError('Conversation introuvable.', 404)

    // Les messages sont supprimés en cascade (onDelete: Cascade)
    await db.conversation.delete({ where: { id: conversation.id } })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[conversation DELETE]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
