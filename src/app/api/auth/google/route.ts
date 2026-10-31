/**
 * Connexion / inscription Google — initiation — DRAX IA Chat
 * GET /api/auth/google → redirection vers Google avec state anti-CSRF.
 */

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import {
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  appOrigin,
  googleAuthorizeUrl,
  isProviderConfigured,
} from '@/lib/oauth'

export async function GET(request: Request) {
  if (!(await isProviderConfigured('google'))) {
    return Response.redirect(
      `${appOrigin(request.url)}/?authError=google-not-configured`,
      302,
    )
  }

  const state = randomBytes(24).toString('hex')
  const store = await cookies()
  store.set(STATE_COOKIE('google'), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  })

  const redirectUri = `${appOrigin(request.url)}/api/auth/google/callback`
  return Response.redirect(await googleAuthorizeUrl(redirectUri, state), 302)
}
