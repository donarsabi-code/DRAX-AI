/**
 * Connexion OAuth réelle — Google & Apple — DRAX IA Chat
 *
 * Flux standard OAuth 2.0 / OpenID Connect, sans dépendance au SDK :
 *  1. /api/auth/{provider} redirige vers le fournisseur avec un `state`
 *     protégé par cookie httpOnly (anti-CSRF, TTL 10 min) ;
 *  2. le callback échange le `code` contre des jetons ;
 *  3. l'identité est vérifiée :
 *       - Google  : l'ID token est validé (signature JWKS Google, émetteur,
 *                   audience) via `jose` ;
 *       - Apple   : l'ID token est validé (JWKS Apple, émetteur, audience)
 *                   et le client_secret est un JWT ES256 signé avec la clé
 *                   privée du compte développeur ;
 *  4. l'utilisateur est résolu/créé (lien par (provider, sub), sinon par
 *     e-mail vérifié) et une session opaque DRAX IA est émise.
 *
 * Configuration requise (variables d'environnement serveur) :
 *   Google : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Apple  : APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID,
 *            APPLE_PRIVATE_KEY (clé .p8 en PEM)
 *   Commun : APP_URL (origine publique, ex. https://mon-site.exemple)
 */

import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { getAppleCredentials, getGoogleCredentials } from '@/lib/server-config'

// ─── Fournisseurs ────────────────────────────────────────────────────────────

export type OAuthProvider = 'google' | 'apple'

export interface ProviderConfig {
  clientId: string
  clientSecret: string
}

/** True si le fournisseur possède des identifiants (BDD → Interface, sinon env). */
export async function isProviderConfigured(provider: OAuthProvider): Promise<boolean> {
  if (provider === 'google') return (await getGoogleCredentials()) !== null
  return (await getAppleCredentials()) !== null
}

/** Origine publique utilisée pour construire les redirect_uri. */
export function appOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  return new URL(requestUrl).origin
}

// ─── Validation de l'identité renvoyée ───────────────────────────────────────

export const oauthIdentitySchema = z.object({
  providerAccountId: z.string().min(1),
  email: z.string().email(),
  emailVerified: z.boolean(),
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().nullable(),
})

export type OAuthIdentity = z.infer<typeof oauthIdentitySchema>

// ─── Google ──────────────────────────────────────────────────────────────────

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export async function googleAuthorizeUrl(redirectUri: string, state: string): Promise<string> {
  const creds = await getGoogleCredentials()
  if (!creds) throw new Error('Google OAuth non configuré')
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  })
  return `${GOOGLE_AUTH}?${params.toString()}`
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthIdentity> {
  const creds = await getGoogleCredentials()
  if (!creds) throw new Error('Google OAuth non configuré')
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Échange du code Google impossible')
  const tokens = (await res.json()) as { id_token?: string }
  if (!tokens.id_token) throw new Error('ID token Google manquant')

  // Validation cryptographique complète du jeton émis par Google
  const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: creds.clientId,
  })

  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!email) throw new Error('Aucun e-mail renvoyé par Google')
  const identity = oauthIdentitySchema.safeParse({
    providerAccountId: String(payload.sub),
    email,
    emailVerified: payload.email_verified === true,
    displayName:
      (typeof payload.name === 'string' && payload.name.trim()) || email.split('@')[0],
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
  })
  if (!identity.success) throw new Error('Identité Google incomplète')
  if (!identity.data.emailVerified) throw new Error("L'e-mail Google n'est pas vérifié")
  return identity.data
}

// ─── Apple ───────────────────────────────────────────────────────────────────

const APPLE_AUTH = 'https://appleid.apple.com/auth/authorize'
const APPLE_TOKEN = 'https://appleid.apple.com/auth/token'
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

const applePrivateKeyPem = (privateKey: string) => privateKey.replace(/\\n/g, '\n')

/** Convertit une clé PEM PKCS#8 en ArrayBuffer pour WebCrypto. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = Buffer.from(b64, 'base64')
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
}

/** client_secret : JWT ES256 exigé par Apple lors de l'échange de code. */
async function appleClientSecret(creds: {
  teamId: string
  keyId: string
  clientId: string
  privateKey: string
}): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(applePrivateKeyPem(creds.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId })
    .setIssuer(creds.teamId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .setAudience('https://appleid.apple.com')
    .setSubject(creds.clientId)
    .sign(privateKey)
}

export async function appleAuthorizeUrl(redirectUri: string, state: string): Promise<string> {
  const creds = await getAppleCredentials()
  if (!creds) throw new Error('Apple OAuth non configuré')
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'form_post',
    state,
  })
  return `${APPLE_AUTH}?${params.toString()}`
}

export async function exchangeAppleCode(
  code: string,
  redirectUri: string,
): Promise<OAuthIdentity> {
  const creds = await getAppleCredentials()
  if (!creds) throw new Error('Apple OAuth non configuré')
  const clientSecret = await appleClientSecret(creds)
  const res = await fetch(APPLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Échange du code Apple impossible')
  const tokens = (await res.json()) as { id_token?: string }
  if (!tokens.id_token) throw new Error('ID token Apple manquant')

  // Validation cryptographique complète du jeton émis par Apple
  const { payload } = await jwtVerify(tokens.id_token, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: creds.clientId,
  })

  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!email) throw new Error('Aucun e-mail renvoyé par Apple')
  const isPrivateRelay = email.endsWith('@privaterelay.appleid.com')
  const identity = oauthIdentitySchema.safeParse({
    providerAccountId: String(payload.sub),
    email,
    // Apple ne renvoie l'e-mail qu'après vérification de sa propre part
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    displayName: isPrivateRelay ? email.split('@')[0] : email.split('@')[0],
    avatarUrl: null, // Apple ne fournit pas de photo
  })
  if (!identity.success) throw new Error('Identité Apple incomplète')
  return identity.data
}

// ─── State anti-CSRF ─────────────────────────────────────────────────────────

export const STATE_COOKIE = (provider: OAuthProvider) => `lumen_oauth_state_${provider}`
export const STATE_TTL_SECONDS = 600
