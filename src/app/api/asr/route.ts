import { NextRequest } from 'next/server'
import { z } from 'zod'
import ZAI from 'z-ai-web-dev-sdk'
import {
  getCurrentUser,
  rateLimit,
  jsonError,
  unauthorized,
  tooMany,
} from '@/lib/auth-server'
import { classifyAiError } from '@/lib/ai-provider'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Transcription vocale serveur (speech-to-text) — DRAX IA Chat
 *
 * Pourquoi une route serveur : la dictée instantanée du navigateur (Web
 * Speech API) n'est pas fiable sur Safari iOS — c'est pourquoi cette route
 * reçoit un enregistrement audio (MediaRecorder, audio/mp4 sur iOS) et le
 * transcrit côté serveur. C'est le même principe que l'application de
 * référence : le micro de l'appareil capture, le serveur transcrit.
 *
 * - Authentification obligatoire + limite de débit par utilisateur
 * - Audio reçu en base64 (formats acceptés : mp4/m4a, webm, wav, mp3)
 * - Taille maximale : 10 Mo (~3-5 minutes de parole)
 * - Aucune donnée audio persistée : le son est transcrit puis jeté
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024

const asrSchema = z.object({
  audio: z
    .string()
    .min(64, 'Enregistrement vide.')
    .max(Math.ceil(MAX_AUDIO_BYTES * 1.4), 'Enregistrement trop long (10 Mo maximum).'),
  mime: z
    .enum(['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/m4a'])
    .optional()
    .default('audio/webm'),
})

export async function POST(req: NextRequest) {
  // ── 1. Authentification + débit ─────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!rateLimit(`asr:${user.id}`, 20, 60 * 1000)) return tooMany()

  // ── 2. Validation ───────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const parsed = asrSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Requête invalide.', 400)
  }
  const { audio } = parsed.data

  // ── 3. Transcription côté serveur ───────────────────────────────────────────
  try {
    const zai = await ZAI.create()
    const result = await zai.audio.asr.create({ file_base64: audio })
    const text = (result?.text ?? '').trim()
    return Response.json({ text })
  } catch (error) {
    const errorType = classifyAiError(error)
    console.error('[asr] transcription error:', errorType, error)
    const message =
      errorType === 'quota'
        ? 'Limite de transcription atteinte. Patientez un instant avant de réessayer.'
        : errorType === 'network'
          ? 'Connexion au service de transcription interrompue. Réessayez.'
          : 'La transcription vocale a échoué. Réessayez, ou écrivez votre message.'
    return jsonError(message, 502, { errorType })
  }
}
