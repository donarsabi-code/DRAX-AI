import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  getCurrentUser,
  messageContentSchema,
  sanitizeText,
  rateLimit,
  clientIp,
  jsonError,
  unauthorized,
  tooMany,
} from '@/lib/auth-server'
import { getChatProvider, resolveModelKey, classifyAiError, generateConversationTitle, type ChatMessageInput, type WebSource } from '@/lib/ai-provider'
import { detectImageIntent } from '@/lib/image-intent'
import { generateImageAttachment, imageGenerationErrorMessage, IMAGE_MODEL } from '@/lib/image-service'
import { logApiEvent } from '@/lib/flux'

export const runtime = 'nodejs'
export const maxDuration = 300

const chatSchema = z.object({
  conversationId: z.string().cuid().optional(),
  content: messageContentSchema.optional(),
  clientRef: z.string().max(64).optional(),
  webSearch: z.boolean().optional().default(false),
  regenerateOf: z.string().cuid().optional(),
  // Sélecteur de modèle (2 options réelles : "fast" | "reasoning")
  model: z.string().max(20).optional(),
})

const HISTORY_LIMIT = 24 // messages récents envoyés au modèle (gestion conversations longues)

function sse(controller: ReadableStreamDefaultController, encoder: TextEncoder, payload: Record<string, unknown>) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
}

export async function POST(req: NextRequest) {
  const fluxStarted = Date.now()
  // ── 1. Authentification ─────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!rateLimit(`chat:${user.id}`, 20, 60 * 1000)) return tooMany()

  // ── 2. Validation ───────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    logApiEvent({ route: '/api/chat', action: 'chat.stream', method: 'POST', status: 400, startedAt: fluxStarted, userId: user.id, meta: { error: 'validation' } })
    return jsonError(parsed.error.issues[0]?.message ?? 'Requête invalide.', 400)
  }
  const { conversationId, clientRef, webSearch, regenerateOf } = parsed.data
  let { content } = parsed.data

  // ── 3. Modèle demandé (corps) sinon préférence utilisateur sinon "fast" ────
  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiModel: true } })
  const modelKey = resolveModelKey(parsed.data.model ?? dbUser?.aiModel)

  // ── 3bis. Fournisseur IA disponible ? ─────────────────────────────────────
  const provider = getChatProvider(modelKey)
  if (!provider.available) {
    return jsonError(
      `Le modèle IA n'est pas configuré côté serveur (${provider.unavailableReason}). Renseignez la variable d'environnement requise puis redémarrez.`,
      503,
      { errorType: 'config' },
    )
  }

  // ── 4. Conversation (création ou contrôle d'accès) ──────────────────────────
  let conversation
  if (conversationId) {
    conversation = await db.conversation.findFirst({ where: { id: conversationId, userId: user.id } })
    if (!conversation) return jsonError('Conversation introuvable.', 404)
  } else {
    conversation = await db.conversation.create({
      data: { userId: user.id, title: 'Nouvelle conversation' },
    })
  }

  // ── 5. Régénération : suppression de la dernière réponse assistant ─────────
  if (regenerateOf) {
    const lastMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    const last = lastMessages[0]
    if (!last || last.id !== regenerateOf || last.role !== 'assistant') {
      return jsonError('Seul le dernier message de l\'assistant peut être régénéré.', 400)
    }
    await db.message.delete({ where: { id: last.id } })
    content = undefined // le contenu est fourni par l'historique
  }

  // ── 6. Message utilisateur (avec déduplication réseau) ─────────────────────
  let userMessage
  if (regenerateOf) {
    const recent = await db.message.findMany({
      where: { conversationId: conversation.id, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    userMessage = recent[0]
    if (!userMessage) return jsonError('Aucun message utilisateur à régénérer.', 400)
  } else {
    if (!content) return jsonError('Le message ne peut pas être vide.', 400)
    if (clientRef) {
      const existing = await db.message.findUnique({
        where: { conversationId_clientRef: { conversationId: conversation.id, clientRef } },
      })
      if (existing) {
        userMessage = existing
      }
    }
    if (!userMessage) {
      userMessage = await db.message.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          role: 'user',
          content,
          clientRef: clientRef ?? null,
        },
      })
    }
  }

  // ── 6bis. Détection d'une demande d'image en langage naturel ────────────────
  // « génère une image de chat », "draw a cat", « 画一只猫 » … → l'image est
  // produite directement dans la conversation, sans activer l'onglet Images.
  // Désactivée quand la recherche web est explicitement demandée ; le quota
  // images (8/min) s'applique également à ce chemin.
  const imageIntent = webSearch
    ? { isImageRequest: false, prompt: null }
    : detectImageIntent(userMessage.content)
  if (imageIntent.isImageRequest && !rateLimit(`image:${user.id}`, 8, 60 * 1000)) {
    return tooMany()
  }

  // ── 7. Historique récent ────────────────────────────────────────────
  const history = await db.message.findMany({
    where: { conversationId: conversation.id, status: { not: 'error' } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  })
  const ordered = [...history].reverse()
  const aiMessages: ChatMessageInput[] = ordered
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      // Les liens d'images générées sont remplacés par une mention textuelle :
      // le modèle de langage ne doit ni répéter ni « inventer » ces URLs.
      content: m.content.replace(
        /!\[[^\]]*\]\(\/api\/images\/file\/[^)]*\)/g,
        '[image générée par DRAX IA, visible dans la conversation]',
      ),
    }))
  if (aiMessages.length === 0) return jsonError('Historique vide.', 400)

  // ── 8. Recherche web optionnelle ────────────────────────────────────────────
  let sources: WebSource[] | null = null
  if (webSearch && provider.searchWeb) {
    try {
      const rawQuery = aiMessages[aiMessages.length - 1].content.slice(0, 400)
      sources = await provider.searchWeb(rawQuery, 5)
      if (sources.length > 0) {
        const contextBlock = [
          '\n\n---',
          'Résultats de recherche web réels obtenus à l\'instant (utilise-les pour répondre, cite-les avec la notation [1], [2]… dans ta réponse) :',
          ...sources.map((s, i) => `[${i + 1}] ${s.name} — ${s.snippet} (source : ${s.url})`),
          '---',
        ].join('\n')
        aiMessages[aiMessages.length - 1] = {
          role: 'user',
          content: aiMessages[aiMessages.length - 1].content + contextBlock,
        }
      }
    } catch (error) {
      console.error('[chat] web search failed:', error)
      // La recherche échoue → on continue sans contexte, l'erreur est signalée au client.
      sources = null
    }
  }

  // ── 9. Génération en streaming ──────────────────────────────────────────────
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = ''
      let finished = false

      const safeEnqueue = (payload: Record<string, unknown>) => {
        if (finished) return
        try {
          sse(controller, encoder, payload)
        } catch {
          // client déjà parti
        }
      }

      try {
        safeEnqueue({
          type: 'meta',
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          userMessageId: userMessage.id,
          model: provider.modelId,
          providerDisplayName: provider.displayName,
          modelKey,
        })

        // ── Chemin « image automatique » : l'image est produite dans la ───────
        // conversation sans passer par le modèle de langage (jamais de réponse
        // « je suis un assistant textuel » pour une demande d'image claire).
        if (imageIntent.isImageRequest) {
          const imagePrompt = imageIntent.prompt ?? userMessage.content
          const intro = "Je génère votre image, cela peut prendre quelques secondes…\n\n"
          safeEnqueue({ type: 'image_start' })
          accumulated += intro
          safeEnqueue({ type: 'delta', text: intro })

          try {
            const img = await generateImageAttachment({
              userId: user.id,
              conversationId: conversation.id,
              prompt: imagePrompt,
            })
            accumulated += img.markdown
            safeEnqueue({ type: 'delta', text: img.markdown })

            const assistantMessage = await db.message.create({
              data: {
                conversationId: conversation.id,
                userId: user.id,
                role: 'assistant',
                content: accumulated,
                model: IMAGE_MODEL,
                status: 'completed',
              },
            })
            await db.conversation.update({
              where: { id: conversation.id },
              data: { updatedAt: new Date() },
            })

            if (conversation.title === 'Nouvelle conversation') {
              const title = sanitizeText(`Image : ${imagePrompt}`, 80)
              await db.conversation.update({ where: { id: conversation.id }, data: { title } })
              safeEnqueue({ type: 'title', conversationId: conversation.id, title })
            }

            safeEnqueue({ type: 'done', messageId: assistantMessage.id, status: 'completed' })
            logApiEvent({
              route: '/api/chat',
              action: 'image.generate',
              method: 'POST',
              status: 200,
              startedAt: fluxStarted,
              userId: user.id,
              meta: { conversationId: conversation.id, promptLength: imagePrompt.length },
            })
            return
          } catch (error) {
            const errorType =
              (error as { errorType?: string }).errorType ?? classifyAiError(error)
            console.error('[chat] automatic image generation error:', errorType, error)
            let errorMessageId: string | null = null
            try {
              const errMessage = await db.message.create({
                data: {
                  conversationId: conversation.id,
                  userId: user.id,
                  role: 'assistant',
                  content: '',
                  model: IMAGE_MODEL,
                  status: 'error',
                  errorType,
                },
              })
              errorMessageId = errMessage.id
            } catch (dbError) {
              console.error('[chat] failed to persist error state:', dbError)
            }
            safeEnqueue({
              type: 'error',
              errorType,
              messageId: errorMessageId,
              message: imageGenerationErrorMessage(errorType),
            })
            return
          }
        }

        if (sources && sources.length > 0) {
          safeEnqueue({ type: 'sources', sources })
        }

        for await (const delta of provider.stream({ messages: aiMessages, signal: abortController.signal })) {
          accumulated += delta
          safeEnqueue({ type: 'delta', text: delta })
        }

        // ── Sauvegarde du message assistant ────────────────────────────────────
        const cancelled = abortController.signal.aborted
        const finalContent = accumulated.trim().length > 0
          ? accumulated
          : cancelled
            ? ''
            : 'Le modèle n\'a renvoyé aucune réponse. Réessayez.'

        const assistantMessage = await db.message.create({
          data: {
            conversationId: conversation.id,
            userId: user.id,
            role: 'assistant',
            content: finalContent,
            model: provider.modelId,
            status: cancelled ? 'cancelled' : 'completed',
            sources: sources && sources.length > 0 ? JSON.stringify(sources) : null,
          },
        })

        await db.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        })

        // ── Auto-titrage (premier échange uniquement) ──────────────────────────
        if (!cancelled && conversation.title === 'Nouvelle conversation' && finalContent.length > 10) {
          const title = await generateConversationTitle(provider, userMessage.content, finalContent)
          if (title) {
            await db.conversation.update({
              where: { id: conversation.id },
              data: { title: sanitizeText(title, 80) },
            })
            safeEnqueue({ type: 'title', conversationId: conversation.id, title })
          }
        }

        safeEnqueue({ type: 'done', messageId: assistantMessage.id, status: cancelled ? 'cancelled' : 'completed' })
        logApiEvent({
          route: '/api/chat',
          action: 'chat.stream',
          method: 'POST',
          status: 200,
          startedAt: fluxStarted,
          userId: user.id,
          meta: {
            conversationId: conversation.id,
            modelKey,
            model: provider.modelId,
            responseLength: finalContent.length,
            webSearch: !!(sources && sources.length > 0),
            cancelled,
          },
        })
      } catch (error) {
        const errorType = classifyAiError(error)
        console.error('[chat] generation error:', errorType, error)
        // Persiste l'échec pour cohérence de l'historique
        let errorMessageId: string | null = null
        try {
          const errMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              userId: user.id,
              role: 'assistant',
              content: '',
              model: provider.modelId,
              status: 'error',
              errorType,
            },
          })
          errorMessageId = errMessage.id
        } catch (dbError) {
          console.error('[chat] failed to persist error state:', dbError)
        }
        safeEnqueue({
          type: 'error',
          errorType,
          messageId: errorMessageId,
          message:
            errorType === 'quota'
              ? 'Quota du fournisseur IA atteint. Veuillez patienter avant de réessayer.'
              : errorType === 'auth'
                ? 'Authentification auprès du fournisseur IA échouée. Vérifiez la configuration serveur.'
                : errorType === 'network'
                  ? 'Connexion au fournisseur IA interrompue. Vérifiez le réseau puis réessayez.'
                  : 'La génération a échoué. Vous pouvez réessayer.',
        })
        logApiEvent({
          route: '/api/chat',
          action: imageIntent.isImageRequest ? 'image.generate' : 'chat.stream',
          method: 'POST',
          status: 500,
          startedAt: fluxStarted,
          userId: user.id,
          meta: { modelKey, errorType },
        })
      } finally {
        finished = true
        try {
          controller.close()
        } catch {
          // déjà fermé
        }
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
