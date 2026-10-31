import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  getCurrentUser,
  sanitizeText,
  rateLimit,
  jsonError,
  unauthorized,
  tooMany,
} from '@/lib/auth-server'
import { classifyAiError } from '@/lib/ai-provider'
import {
  generateImageAttachment,
  imageGenerationErrorMessage,
  IMAGE_MODEL,
  IMAGE_SIZES,
} from '@/lib/image-service'
import { logApiEvent } from '@/lib/flux'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Génération d'images — DRAX IA Chat
 * - Authentification obligatoire + limite de débit par utilisateur
 * - Le prompt est validé côté serveur (longueur), la taille restreinte à une liste fixe
 * - L'image générée est stockée dans un dossier PRIVÉ (db/generated-images),
 *   référencée par un enregistrement Attachment, et servie uniquement au
 *   propriétaire via /api/images/file/[id] (contrôle d'accès à chaque requête)
 * - Message utilisateur persisté avec clientRef → aucune duplication en cas de réessai
 * - Échec de génération : aucune donnée incohérente persistée côté assistant ;
 *   le client peut réessayer avec le même clientRef (dédupliqué côté serveur)
 */

const imageSchema = z.object({
  conversationId: z.string().cuid().optional(),
  // prompt requis sauf en régénération (le prompt est alors repris de la base)
  prompt: z.string().trim().max(1000, 'La description ne doit pas dépasser 1000 caractères.').optional(),
  clientRef: z.string().max(64).optional(),
  size: z.enum(IMAGE_SIZES).optional().default('1024x1024'),
  regenerateOf: z.string().cuid().optional(),
})

export async function POST(req: NextRequest) {
  const fluxStarted = Date.now()
  // ── 1. Authentification + débit ─────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!rateLimit(`image:${user.id}`, 8, 60 * 1000)) return tooMany()

  // ── 2. Validation ───────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const parsed = imageSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Requête invalide.', 400)
  }
  const { conversationId, clientRef, size, regenerateOf } = parsed.data
  let prompt = typeof parsed.data.prompt === 'string' ? sanitizeText(parsed.data.prompt, 1000) : undefined

  // Envoi normal : un prompt est obligatoire
  if (!regenerateOf && (!prompt || prompt.length === 0)) {
    return jsonError("Décrivez l'image à générer.", 400)
  }

  // ── 3. Conversation (création ou contrôle d'accès) ──────────────────────────
  let conversation
  if (conversationId) {
    conversation = await db.conversation.findFirst({ where: { id: conversationId, userId: user.id } })
    if (!conversation) return jsonError('Conversation introuvable.', 404)
  } else {
    conversation = await db.conversation.create({
      data: { userId: user.id, title: 'Nouvelle conversation' },
    })
  }

  // ── 4. Régénération : suppression de la dernière réponse assistant ──────────
  if (regenerateOf) {
    const lastMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    const last = lastMessages[0]
    if (!last || last.id !== regenerateOf || last.role !== 'assistant') {
      return jsonError("Seul le dernier message de l'assistant peut être régénéré.", 400)
    }
    await db.message.delete({ where: { id: last.id } })
    const recentUser = await db.message.findFirst({
      where: { conversationId: conversation.id, role: 'user' },
      orderBy: { createdAt: 'desc' },
    })
    if (!recentUser) return jsonError('Aucune description à régénérer.', 400)
    prompt = recentUser.content
  }

  // ── 4bis. Garantie de type : après régénération, prompt provient de la base ;
  // sinon il a été validé non vide à l'étape 2.
  if (!prompt) return jsonError("Décrivez l'image à générer.", 400)

  // ── 5. Message utilisateur (déduplication réseau via clientRef) ─────────────
  let userMessage
  if (!regenerateOf && clientRef) {
    const existing = await db.message.findUnique({
      where: { conversationId_clientRef: { conversationId: conversation.id, clientRef } },
    })
    if (existing) userMessage = existing
  }
  if (!userMessage) {
    // En régénération, le message utilisateur existe déjà (le prompt provient
    // de la base) → on le réutilise plutôt que d'en créer un doublon.
    const recentUser = await db.message.findFirst({
      where: { conversationId: conversation.id, role: 'user' },
      orderBy: { createdAt: 'desc' },
    })
    userMessage =
      regenerateOf && recentUser
        ? recentUser
        : await db.message.create({
            data: {
              conversationId: conversation.id,
              userId: user.id,
              role: 'user',
              content: prompt,
              clientRef: clientRef ?? null,
            },
          })
  }

  // ── 6-8. Génération, stockage privé et enregistrement (service partagé) ────
  let img
  try {
    img = await generateImageAttachment({
      userId: user.id,
      conversationId: conversation.id,
      prompt,
      size,
    })
  } catch (error) {
    const errorType = (error as { errorType?: string }).errorType ?? classifyAiError(error)
    console.error('[images] generation error:', errorType, error)
    logApiEvent({
      route: '/api/images',
      action: 'image.generate',
      method: 'POST',
      status: 502,
      startedAt: fluxStarted,
      userId: user.id,
      meta: { conversationId: conversation.id, errorType },
    })
    return jsonError(
      error instanceof Error && error.message
        ? error.message
        : imageGenerationErrorMessage(errorType),
      502,
      { errorType },
    )
  }

  // ── 8. Message assistant : l'image est référencée en Markdown ───────────────
  const assistantMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      userId: user.id,
      role: 'assistant',
      content: img.markdown,
      model: IMAGE_MODEL,
      status: 'completed',
    },
  })

  // ── 9. Titre de conversation (généré localement, sans appel IA) ─────────────
  let title = conversation.title
  if (title === 'Nouvelle conversation') {
    title = sanitizeText(`Image : ${prompt}`, 80)
    await db.conversation.update({ where: { id: conversation.id }, data: { title } })
  }
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })

  logApiEvent({
    route: '/api/images',
    action: 'image.generate',
    method: 'POST',
    status: 200,
    startedAt: fluxStarted,
    userId: user.id,
    meta: { conversationId: conversation.id, size, promptLength: prompt.length },
  })

  // ── 10. Réponse (même sérialisation que GET messages) ───────────────────────
  const serialize = (m: {
    id: string
    role: string
    content: string
    model: string | null
    status: string
    errorType: string | null
    sources: string | null
    createdAt: Date
  }) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    status: m.status,
    errorType: m.errorType,
    sources: m.sources ? JSON.parse(m.sources) : null,
    createdAt: m.createdAt,
  })

  return Response.json({
    conversation: { id: conversation.id, title },
    userMessage: serialize(userMessage),
    assistantMessage: serialize(assistantMessage),
  })
}
