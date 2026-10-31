/**
 * Connexion / inscription Apple — initiation — DRAX IA Chat
 * GET /api/auth/apple → redirection vers Apple (réponse en form_post).
 */

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import {
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  appleAuthorizeUrl,
  appOrigin,
  isProviderConfigured,
} from '@/lib/oauth'

export async function GET(request: Request) {
  if (!(await isProviderConfigured('apple'))) {
    return Response.redirect(
      `${appOrigin(request.url)}/?authError=apple-not-configured`,
      302,
    )
  }

  const state = randomBytes(24).toString('hex')
  const store = await cookies()
  store.set(STATE_COOKIE('apple'), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  })

  const redirectUri = `${appOrigin(request.url)}/api/auth/apple/callback`
  return Response.redirect(await appleAuthorizeUrl(redirectUri, state), 302)
}
