import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  emailSchema,
  passwordSchema,
  displayNameSchema,
  hashPassword,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  rateLimit,
  clientIp,
  jsonError,
  tooMany,
} from '@/lib/auth-server'
import { logApiEvent } from '@/lib/flux'

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})

export async function POST(req: NextRequest) {
  const fluxStarted = Date.now()
  try {
    const ip = clientIp(req.headers)
    if (!rateLimit(`register:${ip}`, 10, 10 * 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)
    }
    const { email, password, displayName } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      logApiEvent({ route: '/api/auth/register', action: 'auth.register', method: 'POST', status: 409, startedAt: fluxStarted, meta: { reason: 'email-exists' } })
      return jsonError('Un compte existe déjà avec cette adresse e-mail.', 409)
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: { email, passwordHash, displayName },
    })

    const token = await createSession(user.id)
    const options = sessionCookieOptions()
    const res = Response.json(
      {
        user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        installGuideDismissed: user.installGuideDismissed,
      },
      },
      { status: 201 },
    )
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}`,
    )
    logApiEvent({ route: '/api/auth/register', action: 'auth.register', method: 'POST', status: 201, startedAt: fluxStarted, userId: user.id })
    return res
  } catch (error) {
    console.error('[register]', error)
    return jsonError('Erreur serveur lors de la création du compte.', 500)
  }
}
