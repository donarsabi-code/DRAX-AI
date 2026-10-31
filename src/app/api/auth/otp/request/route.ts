/**
 * Demande d'un code à 6 chiffres par e-mail (connexion OU inscription) — DRAX IA
 * POST /api/auth/otp/request  { email }
 *
 * - Un même parcours : si l'e-mail n'a pas de compte, le code créera le compte.
 * - Le code est envoyé par SMTP réel ; sans SMTP configuré, il est renvoyé en
 *   mode développement (clairement étiqueté) pour permettre les tests locaux.
 * - Anti-abus : rate limiting par IP et par e-mail.
 */

import { headers } from 'next/headers'
import { db } from '@/lib/db'
import {
  clientIp,
  emailSchema,
  jsonError,
  rateLimit,
  sanitizeText,
  tooMany,
} from '@/lib/auth-server'
import { issueOtpCode } from '@/lib/otp'
import { isEmailConfigured, sendOtpEmail } from '@/lib/mailer'

const RESEND_COOLDOWN_MS = 60_000

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const parsedEmail = emailSchema.safeParse(body.email ?? '')
  if (!parsedEmail.success) {
    return jsonError('Adresse e-mail invalide.', 400)
  }
  const email = parsedEmail.data

  const hdrs = await headers()
  const ip = clientIp(hdrs)

  // Anti-abus : 6 demandes / h / IP, 3 / 10 min / e-mail, renvoi après 60 s max
  if (!rateLimit(`otp:req:ip:${ip}`, 6, 60 * 60 * 1000)) return tooMany()
  if (!rateLimit(`otp:req:email:${email}`, 3, 10 * 60 * 1000)) return tooMany()
  const last = await db.emailOtpCode.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return jsonError('Un code vient d’être envoyé. Patientez une minute avant le renvoi.', 429)
  }

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  })

  const code = await issueOtpCode(email)
  const isNewAccount = existingUser === null

  if (await isEmailConfigured()) {
    try {
      await sendOtpEmail(email, code, isNewAccount)
    } catch (error) {
      console.error('[otp/request] envoi SMTP impossible :', error)
      return jsonError(
        "L'envoi de l'e-mail a échoué côté serveur. Réessayez dans un instant.",
        502,
      )
    }
    return Response.json({
      ok: true,
      isNewAccount,
      delivery: 'email',
      message: `Code envoyé à ${sanitizeText(email, 254)}. Vérifiez votre boîte (et vos indésirables).`,
    })
  }

  // Mode développement : aucun SMTP configuré
  return Response.json({
    ok: true,
    isNewAccount,
    delivery: 'dev',
    devCode: code,
    message:
      'Serveur sans service e-mail configuré (SMTP). En production, ce code serait envoyé par e-mail.',
  })
}
