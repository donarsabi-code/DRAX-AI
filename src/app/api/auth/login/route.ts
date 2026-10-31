import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  emailSchema,
  passwordSchema,
  verifyPassword,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  rateLimit,
  clientIp,
  jsonError,
  tooMany,
} from '@/lib/auth-server'
import { logApiEvent } from '@/lib/flux'

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis.').max(200),
})

export async function POST(req: NextRequest) {
  const fluxStarted = Date.now()
  try {
    const ip = clientIp(req.headers)
    if (!rateLimit(`login:${ip}`, 15, 10 * 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => null)
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)
    }
    const { email, password } = parsed.data

    const user = await db.user.findUnique({ where: { email } })
    // Message d'erreur volontairement générique (pas d'énumération de comptes)
    const genericError = jsonError('E-mail ou mot de passe incorrect.', 401)
    if (!user) {
      logApiEvent({ route: '/api/auth/login', action: 'auth.login', method: 'POST', status: 401, startedAt: fluxStarted, meta: { reason: 'unknown-email' } })
      return genericError
    }
    // Compte créé via Google / Apple / code e-mail : aucun mot de passe local
    if (!user.passwordHash) {
      return jsonError(
        "Ce compte n'a pas de mot de passe. Connectez-vous avec Google, Apple ou le code e-mail.",
        400,
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      logApiEvent({ route: '/api/auth/login', action: 'auth.login', method: 'POST', status: 401, startedAt: fluxStarted, meta: { reason: 'bad-password' } })
      return genericError
    }

    const token = await createSession(user.id)
    const options = sessionCookieOptions()
    const res = Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        installGuideDismissed: user.installGuideDismissed,
      },
    })
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}`,
    )
    logApiEvent({ route: '/api/auth/login', action: 'auth.login', method: 'POST', status: 200, startedAt: fluxStarted, userId: user.id })
    return res
  } catch (error) {
    console.error('[login]', error)
    return jsonError('Erreur serveur lors de la connexion.', 500)
  }
}
