/**
 * Service de génération d'images — DRAX IA Chat
 *
 * Logique partagée entre la route dédiée /api/images (onglet « Images » du
 * composeur) et le chemin automatique de /api/chat (demande d'image en
 * langage naturel). Le SDK z-ai-web-dev-sdk est résolu exclusivement côté
 * serveur ; aucune clé n'est exposée au client.
 *
 * Garanties :
 *  - l'image est stockée dans un dossier PRIVÉ (db/generated-images), jamais
 *    servi statiquement : l'accès passe par /api/images/file/[id] qui vérifie
 *    la session et l'appartenance à chaque requête ;
 *  - le type MIME réel est détecté par octets magiques (le fournisseur peut
 *    renvoyer du JPEG/WebP quelle que soit la taille demandée) ;
 *  - chaque image est référencée par un enregistrement Attachment (traçabilité
 *    et suppression en cascade avec la conversation).
 */

import { randomUUID } from 'crypto'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { classifyAiError } from '@/lib/ai-provider'
import { storeGeneratedImage } from '@/lib/storage'

/** Modèle persisté sur les messages contenant une image générée. */
export const IMAGE_MODEL = 'drax-image-1'

/** Tailles acceptées par le générateur (liste fermée, validée par Zod). */
export const IMAGE_SIZES = ['1024x1024', '768x1344', '1344x768', '1152x864', '1440x720'] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

export type GeneratedImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

/** Détection du type réel de l'image par octets magiques. */
export function detectImageMime(buf: Buffer): GeneratedImageMime | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** Construit le Markdown sécurisé pointant vers l'API privée d'images. */
export function buildImageMarkdown(attachmentId: string, alt: string): string {
  const safeAlt = alt.replace(/[[\]()\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `![${safeAlt}](/api/images/file/${attachmentId})`
}

/** Message d'erreur lisible associé à une catégorie d'erreur génération. */
export function imageGenerationErrorMessage(errorType: string): string {
  switch (errorType) {
    case 'quota':
      return "Quota du générateur d'images atteint. Patientez un instant avant de réessayer."
    case 'network':
      return 'Connexion au générateur d’images interrompue. Réessayez.'
    case 'auth':
    case 'config':
      return "Le générateur d'images n'est pas configuré sur ce serveur (clé du moteur IA manquante : ZAI_API_KEY)."
    default:
      return "La génération d'image a échoué. Reformulez éventuellement votre description puis réessayez."
  }
}

export interface GeneratedImage {
  attachmentId: string
  mime: GeneratedImageMime
  sizeBytes: number
  /** Markdown complet à insérer dans le message assistant. */
  markdown: string
  alt: string
}

/**
 * Convertit la demande utilisateur (souvent en français, avec des préfixes
 * comme « générer une image de… ») en un prompt visuel concis en anglais —
 * les générateurs d'images sont entraînés principalement en anglais et
 * échouent ou produisent des résultats médiocres sur des phrases brutes.
 * En cas d'échec de la conversion (réseau, délai), on retombe sur le texte
 * brut : la génération reste possible quoi qu'il arrive.
 */
async function toVisualPrompt(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  raw: string,
): Promise<string> {
  const TIMEOUT_MS = 12_000
  try {
    const request = zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            "Tu convertis une demande utilisateur en un prompt concis pour un générateur d'images. Réponds UNIQUEMENT par le prompt final en anglais, sans guillemets, sans préambule, 40 mots maximum. Décris la scène visuelle : sujet, action, décor, style, qualité. Ignore les préfixes d'instruction (« générer une image de », « dessine », etc.).",
        },
        { role: 'user', content: raw },
      ],
      thinking: { type: 'disabled' },
    })
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
    const res = (await Promise.race([request, timeout])) as Awaited<typeof request> | null
    const text = res?.choices?.[0]?.message?.content?.replace(/^["'\s]+|["'\s]+$/g, '') ?? ''
    if (text.length >= 3) return text
  } catch {
    // Conversion impossible : on garde le texte original
  }
  return raw
}

/**
 * Génère l'image, la stocke dans le dossier privé et crée l'enregistrement
 * Attachment. Lève une exception en cas d'échec (classifiée par classifyAiError
 * côté appelant).
 */
export async function generateImageAttachment(opts: {
  userId: string
  conversationId: string
  prompt: string
  size?: ImageSize
}): Promise<GeneratedImage> {
  const prompt = opts.prompt
  const size = opts.size ?? '1024x1024'

  // ── Génération via le fournisseur (résolu côté serveur) ─────────────────────
  // 1. Le SDK est créé une seule fois ; 2. le prompt est converti en description
  //    visuelle anglaise (les prompts français bruts échouent souvent côté
  //    fournisseur) ; 3. deux tentatives de génération avec backoff : les
  //    erreurs réseau temporaires du fournisseur (HTTP 500) sont absorbées.
  let base64: string
  try {
    const zai = await ZAI.create()
    const visualPrompt = await toVisualPrompt(zai, prompt)
    const MAX_ATTEMPTS = 2
    let lastError: unknown = null
    base64 = ''
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await zai.images.generations.create({ prompt: visualPrompt, size })
        base64 = result?.data?.[0]?.base64 ?? ''
        if (base64) break
        lastError = new Error('Réponse de génération vide')
      } catch (attemptError) {
        lastError = attemptError
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 2_500))
      }
    }
    if (!base64) throw lastError ?? new Error('Réponse de génération vide')
  } catch (error) {
    const errorType = classifyAiError(error)
    console.error('[image-service] generation error:', errorType, error)
    const wrapped = new Error(imageGenerationErrorMessage(errorType)) as Error & { errorType?: string }
    wrapped.errorType = errorType
    throw wrapped
  }

  // ── Vérification du type réel ───────────────────────────────────────────────
  const buffer = Buffer.from(base64, 'base64')
  const mime = detectImageMime(buffer)
  if (!mime) {
    console.error('[image-service] fournisseur a renvoyé un fichier non image')
    const wrapped = new Error(
      'Le fournisseur a renvoyé un fichier non reconnu comme image. Réessayez.',
    ) as Error & { errorType?: string }
    wrapped.errorType = 'unknown'
    throw wrapped
  }

  // ── Stockage privé (base sur Vercel, dossier privé ailleurs) ────────────────
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp'
  const fileName = `${randomUUID()}.${ext}`
  const stored = await storeGeneratedImage(buffer, fileName)

  // ── Enregistrement en base (cascade avec la conversation) ───────────────────
  const attachment = await db.attachment.create({
    data: {
      userId: opts.userId,
      conversationId: opts.conversationId,
      storagePath: stored.storagePath,
      dataBase64: stored.dataBase64,
      fileName: stored.fileName,
      mimeType: mime,
      sizeBytes: buffer.length,
    },
  })

  const alt = prompt.replace(/[[\]()\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return {
    attachmentId: attachment.id,
    mime,
    sizeBytes: buffer.length,
    markdown: buildImageMarkdown(attachment.id, alt),
    alt,
  }
}
