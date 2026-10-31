/**
 * Connexion / inscription Apple — callback — DRAX IA Chat
 * POST /api/auth/apple/callback
 * Apple répond en form_post : body application/x-www-form-urlencoded avec
 * `code`, `state` et (première connexion uniquement) `user` (nom).
 * L'ID token est validé cryptographiquement (JWKS Apple, émetteur, audience).
 */

import { cookies } from 'next/headers'
import { STATE_COOKIE, appOrigin, exchangeAppleCode } from '@/lib/oauth'
import { resolveOAuthUser } from '@/lib/oauth-user'

function fail(origin: string, code: string): Response {
  return Response.redirect(`${origin}/?authError=${encodeURIComponent(code)}`, 302)
}

export async function POST(request: Request) {
  const origin = appOrigin(request.url)
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return fail(origin, 'apple-invalid-content-type')
  }

  const form = new URLSearchParams(await request.text())
  const code = form.get('code')
  const state = form.get('state')

  // Nom complet : envoyé par Apple UNIQUEMENT à la première autorisation
  let firstName = ''
  let lastName = ''
  const rawUser = form.get('user')
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser) as {
        name?: { firstName?: string; lastName?: string }
      }
      firstName = parsed.name?.firstName ?? ''
      lastName = parsed.name?.lastName ?? ''
    } catch {
      // champ malformé ignoré — le nom reste dérivé de l'e-mail
    }
  }

  if (!code || !state) return fail(origin, 'apple-missing-params')

  const store = await cookies()
  const expected = store.get(STATE_COOKIE('apple'))?.value
  store.delete(STATE_COOKIE('apple'))
  if (!expected || expected !== state) return fail(origin, 'apple-invalid-state')

  try {
    const redirectUri = `${origin}/api/auth/apple/callback`
    const identity = await exchangeAppleCode(code, redirectUri)

    // Si Apple fournit le nom (1re connexion), on privilégie ce nom réel
    const fullName = `${firstName} ${lastName}`.trim()
    if (fullName) identity.displayName = fullName.slice(0, 40)

    const { sessionToken, isNewUser } = await resolveOAuthUser('apple', identity)

    const res = Response.redirect(`${origin}/?authWelcome=${isNewUser ? 'new' : 'back'}`, 302)
    res.headers.append(
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
    console.error('[auth/apple/callback]', error)
    return fail(origin, 'apple-failed')
  }
}
