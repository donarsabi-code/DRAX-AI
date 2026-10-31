/**
 * Configuration serveur — DRAX IA Chat
 * GET    /api/admin/server-config           → état des fournisseurs (owner)
 * PUT    /api/admin/server-config           → enregistre une section
 *          { section: 'google', clientId, clientSecret }
 *          { section: 'apple', clientId, teamId, keyId, privateKey }
 *          { section: 'smtp', host, port?, user, pass, from? }
 *          { section: 'test-smtp', to }      → envoie un VRAI e-mail de test
 * DELETE /api/admin/server-config?section=x → réinitialise une section
 *
 * Accès réservé au PROPRIÉTAIRE du serveur = premier compte créé.
 * Les secrets ne sont jamais renvoyés (valeurs masquées).
 */

import { headers } from 'next/headers'
import { z } from 'zod'
import {
  SERVER_SETTING_KEYS,
  deleteServerSettings,
  getAppleCredentials,
  getGoogleCredentials,
  getOwnerId,
  getSmtpCredentials,
  isOwner,
  maskSecret,
  setServerSettings,
} from '@/lib/server-config'
import { getCurrentUser, jsonError } from '@/lib/auth-server'
import { sendTestEmail } from '@/lib/mailer'
import { logApiEvent } from '@/lib/flux'

const googleSchema = z.object({
  section: z.literal('google'),
  clientId: z.string().trim().min(10, 'Client ID Google invalide').max(200),
  clientSecret: z.string().trim().min(10, 'Client Secret Google invalide').max(200),
})

const smtpSchema = z.object({
  section: z.literal('smtp'),
  host: z.string().trim().min(3, 'Hôte SMTP invalide').max(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  user: z.string().trim().min(3, 'Utilisateur SMTP invalide').max(254),
  pass: z.string().min(4, 'Mot de passe / App Password trop court').max(200),
  from: z.string().trim().max(254).optional(),
})

const appleSchema = z.object({
  section: z.literal('apple'),
  clientId: z.string().trim().min(5).max(200),
  teamId: z.string().trim().min(5).max(40),
  keyId: z.string().trim().min(5).max(40),
  privateKey: z.string().min(50, 'Clé privée .p8 invalide').max(5000),
})

const testSchema = z.object({
  section: z.literal('test-smtp'),
  to: z.string().trim().email('Adresse e-mail de test invalide'),
})

const bodySchema = z.discriminatedUnion('section', [
  googleSchema,
  smtpSchema,
  appleSchema,
  testSchema,
])

const SECTIONS = ['google', 'smtp', 'apple'] as const
type Section = (typeof SECTIONS)[number]

const SECTION_KEYS: Record<Section, string[]> = {
  google: [SERVER_SETTING_KEYS.googleClientId, SERVER_SETTING_KEYS.googleClientSecret],
  smtp: [
    SERVER_SETTING_KEYS.smtpHost,
    SERVER_SETTING_KEYS.smtpPort,
    SERVER_SETTING_KEYS.smtpUser,
    SERVER_SETTING_KEYS.smtpPass,
    SERVER_SETTING_KEYS.smtpFrom,
  ],
  apple: [
    SERVER_SETTING_KEYS.appleClientId,
    SERVER_SETTING_KEYS.appleTeamId,
    SERVER_SETTING_KEYS.appleKeyId,
    SERVER_SETTING_KEYS.applePrivateKey,
  ],
}

async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) return { error: jsonError('Authentification requise.', 401) }
  const owner = await isOwner(user.id)
  if (!owner) {
    return {
      error: jsonError(
        'Réservé au propriétaire du serveur (premier compte créé). Les autres comptes ne peuvent pas modifier la configuration.',
        403,
      ),
    }
  }
  return { user }
}

async function buildStatus(origin: string) {
  const [google, apple, smtp, ownerId] = await Promise.all([
    getGoogleCredentials(),
    getAppleCredentials(),
    getSmtpCredentials(),
    getOwnerId(),
  ])
  return {
    isOwner: true,
    ownerId,
    emailMode: smtp ? ('real' as const) : ('demo' as const),
    redirectUris: {
      google: `${origin}/api/auth/google/callback`,
      apple: `${origin}/api/auth/apple/callback`,
    },
    google: {
      configured: google !== null,
      source: google?.source ?? null,
      clientIdMasked: google ? maskSecret(google.clientId) : null,
    },
    apple: {
      configured: apple !== null,
      source: apple?.source ?? null,
      clientIdMasked: apple ? maskSecret(apple.clientId) : null,
    },
    smtp: {
      configured: smtp !== null,
      source: smtp?.source ?? null,
      host: smtp?.host ?? null,
      port: smtp?.port ?? null,
      user: smtp?.user ?? null,
      from: smtp?.from ?? null,
      passMasked: smtp ? maskSecret(smtp.pass) : null,
    },
  }
}

export async function GET(request: Request) {
  const guard = await requireOwner()
  if (guard.error) return guard.error
  const origin = new URL(request.url).origin
  return Response.json(await buildStatus(origin))
}

export async function PUT(request: Request) {
  const fluxStarted = Date.now()
  const guard = await requireOwner()
  if (guard.error) return guard.error
  const user = guard.user!

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)
  }
  const data = parsed.data

  try {
    if (data.section === 'google') {
      await setServerSettings({
        [SERVER_SETTING_KEYS.googleClientId]: data.clientId,
        [SERVER_SETTING_KEYS.googleClientSecret]: data.clientSecret,
      })
    } else if (data.section === 'smtp') {
      await setServerSettings({
        [SERVER_SETTING_KEYS.smtpHost]: data.host,
        [SERVER_SETTING_KEYS.smtpPort]: String(data.port),
        [SERVER_SETTING_KEYS.smtpUser]: data.user,
        [SERVER_SETTING_KEYS.smtpPass]: data.pass,
        ...(data.from ? { [SERVER_SETTING_KEYS.smtpFrom]: data.from } : {}),
      })
    } else if (data.section === 'apple') {
      await setServerSettings({
        [SERVER_SETTING_KEYS.appleClientId]: data.clientId,
        [SERVER_SETTING_KEYS.appleTeamId]: data.teamId,
        [SERVER_SETTING_KEYS.appleKeyId]: data.keyId,
        [SERVER_SETTING_KEYS.applePrivateKey]: data.privateKey,
      })
    } else if (data.section === 'test-smtp') {
      // Test d'envoi RÉEL : le message arrive dans la boîte indiquée
      await sendTestEmail(data.to)
      logApiEvent({
        route: '/api/admin/server-config',
        action: 'admin.serverConfig.testEmail',
        method: 'PUT',
        status: 200,
        startedAt: fluxStarted,
        userId: user.id,
      })
      return Response.json({
        ok: true,
        message: `E-mail de test envoyé à ${data.to}. Vérifiez la boîte (et les indésirables).`,
      })
    }

    logApiEvent({
      route: '/api/admin/server-config',
      action: `admin.serverConfig.update.${data.section}`,
      method: 'PUT',
      status: 200,
      startedAt: fluxStarted,
      userId: user.id,
    })

    const hdrs = await headers()
    const proto = hdrs.get('x-forwarded-proto')
    const host = hdrs.get('host')
    const origin = proto && host ? `${proto}://${host}` : new URL(request.url).origin
    return Response.json({
      ok: true,
      status: await buildStatus(origin),
      message:
        data.section === 'smtp'
          ? 'Serveur e-mail connecté : mode RÉEL activé (codes envoyés dans les boîtes).'
          : 'Fournisseur connecté : la connexion est désormais active.',
    })
  } catch (error) {
    console.error('[admin/server-config PUT]', error)
    const detail = error instanceof Error ? error.message : 'Erreur inconnue'
    return jsonError(`Échec de l'opération : ${detail}`, 502)
  }
}

export async function DELETE(request: Request) {
  const guard = await requireOwner()
  if (guard.error) return guard.error

  const section = new URL(request.url).searchParams.get('section')
  if (!section || !SECTIONS.includes(section as Section)) {
    return jsonError('Section invalide (google | smtp | apple).', 400)
  }
  await deleteServerSettings(SECTION_KEYS[section as Section])
  const origin = new URL(request.url).origin
  return Response.json({
    ok: true,
    status: await buildStatus(origin),
    message: 'Section réinitialisée.',
  })
}
