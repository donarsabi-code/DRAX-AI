/**
 * Vérification du code e-mail et ouverture de session — DRAX IA Chat
 * POST /api/auth/otp/verify  { email, code, displayName? }
 *
 * - Code correct → connexion si le compte existe, SINON création du compte
 *   (inscription par code, comme demandé) puis session pour les deux cas.
 * - Le code est à usage unique, TTL 10 min, 5 tentatives maximum.
 * - Cookie de session httpOnly identique à la connexion par mot de passe.
 */

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  clientIp,
  displayNameSchema,
  emailSchema,
  jsonError,
  rateLimit,
  sessionCookieOptions,
  tooMany,
} from '@/lib/auth-server'
import { verifyOtpCode } from '@/lib/otp'
import { logApiEvent } from '@/lib/flux'

export async function POST(request: Request) {
  const fluxStarted = Date.now()
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    code?: string
    displayName?: string
  }

  const parsedEmail = emailSchema.safeParse(body.email ?? '')
  if (!parsedEmail.success) return jsonError('Adresse e-mail invalide.', 400)
  const email = parsedEmail.data
  const code = typeof body.code === 'string' ? body.code : ''

  const hdrs = await headers()
  const ip = clientIp(hdrs)
  if (!rateLimit(`otp:verify:ip:${ip}`, 10, 10 * 60 * 1000)) return tooMany()
  if (!rateLimit(`otp:verify:email:${email}`, 8, 10 * 60 * 1000)) return tooMany()

  const result = await verifyOtpCode(email, code)
  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      expired: 'Code expiré. Demandez un nouveau code.',
      invalid: 'Code incorrect.',
      'too-many-attempts':
        'Trop de tentatives. Ce code est bloqué — demandez-en un nouveau.',
    }
    return jsonError(messages[result.reason], 400, { reason: result.reason })
  }

  // Connexion ou inscription selon l'existence du compte
  let user = await db.user.findUnique({ where: { email } })
  let isNewUser = false
  if (!user) {
    const name = displayNameSchema.safeParse(body.displayName ?? '')
    const displayName = name.success
      ? name.data
      : email.split('@')[0].slice(0, 40) || 'Utilisateur'
    user = await db.user.create({
      data: { email, passwordHash: null, displayName },
    })
    isNewUser = true
  }

  // Session opaque (même mécanique que login/password)
  const { createSession } = await import('@/lib/auth-server')
  const sessionToken = await createSession(user.id)

  logApiEvent({
    route: '/api/auth/otp/verify',
    action: isNewUser ? 'auth.otp.register' : 'auth.otp.login',
    method: 'POST',
    status: 200,
    startedAt: fluxStarted,
    userId: user.id,
  })

  const res = NextResponse.json({
    ok: true,
    isNewUser,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      installGuideDismissed: user.installGuideDismissed,
    },
  })
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions())
  return res
}
