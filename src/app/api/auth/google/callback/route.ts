/**
 * Connexion / inscription Google — callback — DRAX IA Chat
 * GET /api/auth/google/callback?code=...&state=...
 * Échange le code, valide l'ID token Google, crée/lie le compte, ouvre la
 * session puis redirige vers l'application.
 */

import { cookies } from 'next/headers'
import {
  STATE_COOKIE,
  appOrigin,
  exchangeGoogleCode,
} from '@/lib/oauth'
import { resolveOAuthUser } from '@/lib/oauth-user'

function fail(origin: string, code: string): Response {
  return Response.redirect(`${origin}/?authError=${encodeURIComponent(code)}`, 302)
}

export async function GET(request: Request) {
  const origin = appOrigin(request.url)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return fail(origin, 'google-missing-params')

  const store = await cookies()
  const expected = store.get(STATE_COOKIE('google'))?.value
  store.delete(STATE_COOKIE('google'))
  if (!expected || expected !== state) return fail(origin, 'google-invalid-state')

  try {
    const redirectUri = `${origin}/api/auth/google/callback`
    const identity = await exchangeGoogleCode(code, redirectUri)
    const { sessionToken, isNewUser } = await resolveOAuthUser('google', identity)

    const res = Response.redirect(`${origin}/?authWelcome=${isNewUser ? 'new' : 'back'}`, 302)
    const headers = res.headers
    headers.append(
      'set-cookie',
      [
        `lumen_session=${sessionToken}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${30 * 24 * 60 * 60}`,
        process.env.NODE_ENV === 'production' ? 'Secure' : '',
      ]
        .filter(Boolean)
        .join('; '),
    )
    return res
  } catch (error) {
    console.error('[auth/google/callback]', error)
    return fail(origin, 'google-failed')
  }
}
