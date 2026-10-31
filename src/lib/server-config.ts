/**
 * Configuration serveur stockée en base de données — DRAX IA Chat
 *
 * Permet au propriétaire du serveur (premier compte créé) de renseigner les
 * identifiants des fournisseurs DIRECTEMENT DEPUIS L'INTERFACE
 * (Paramètres → Serveur), sans toucher aux fichiers du serveur :
 *
 *   - Google OAuth  : google_client_id, google_client_secret
 *   - SMTP e-mail   : smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
 *   - Apple OAuth   : apple_client_id, apple_team_id, apple_key_id,
 *                     apple_private_key
 *
 * Priorité de lecture : BDD (Interface) > variables d'environnement (.env).
 * Les secrets ne quittent JAMAIS le serveur : les réponses API sont masquées.
 */

import { db } from '@/lib/db'

// ─── Clés stockées ───────────────────────────────────────────────────────────

export const SERVER_SETTING_KEYS = {
  googleClientId: 'google_client_id',
  googleClientSecret: 'google_client_secret',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpUser: 'smtp_user',
  smtpPass: 'smtp_pass',
  smtpFrom: 'smtp_from',
  appleClientId: 'apple_client_id',
  appleTeamId: 'apple_team_id',
  appleKeyId: 'apple_key_id',
  applePrivateKey: 'apple_private_key',
} as const

export type ServerSettingKey = (typeof SERVER_SETTING_KEYS)[keyof typeof SERVER_SETTING_KEYS]

export async function getServerSetting(key: string): Promise<string | null> {
  const row = await db.serverSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

/** Écrit (ou met à jour) plusieurs clés en une transaction. */
export async function setServerSettings(entries: Record<string, string>): Promise<void> {
  const ops = Object.entries(entries).map(([key, value]) =>
    db.serverSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
  )
  await db.$transaction(ops)
}

/** Supprime des clés (retour à la configuration par variables d'env / démo). */
export async function deleteServerSettings(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await db.serverSetting.deleteMany({ where: { key: { in: keys } } })
}

// ─── Google OAuth ────────────────────────────────────────────────────────────

export interface GoogleCredentials {
  clientId: string
  clientSecret: string
  source: 'bdd' | 'env'
}

export async function getGoogleCredentials(): Promise<GoogleCredentials | null> {
  const [dbId, dbSecret] = await Promise.all([
    getServerSetting(SERVER_SETTING_KEYS.googleClientId),
    getServerSetting(SERVER_SETTING_KEYS.googleClientSecret),
  ])
  if (dbId && dbSecret) return { clientId: dbId, clientSecret: dbSecret, source: 'bdd' }

  const envId = process.env.GOOGLE_CLIENT_ID?.trim()
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret, source: 'env' }
  return null
}

// ─── Apple OAuth ─────────────────────────────────────────────────────────────

export interface AppleCredentials {
  clientId: string
  teamId: string
  keyId: string
  privateKey: string
  source: 'bdd' | 'env'
}

export async function getAppleCredentials(): Promise<AppleCredentials | null> {
  const [dbId, dbTeam, dbKey, dbPriv] = await Promise.all([
    getServerSetting(SERVER_SETTING_KEYS.appleClientId),
    getServerSetting(SERVER_SETTING_KEYS.appleTeamId),
    getServerSetting(SERVER_SETTING_KEYS.appleKeyId),
    getServerSetting(SERVER_SETTING_KEYS.applePrivateKey),
  ])
  if (dbId && dbTeam && dbKey && dbPriv)
    return { clientId: dbId, teamId: dbTeam, keyId: dbKey, privateKey: dbPriv, source: 'bdd' }

  const envId = process.env.APPLE_CLIENT_ID?.trim()
  const envTeam = process.env.APPLE_TEAM_ID?.trim()
  const envKey = process.env.APPLE_KEY_ID?.trim()
  const envPriv = process.env.APPLE_PRIVATE_KEY?.trim()
  if (envId && envTeam && envKey && envPriv)
    return { clientId: envId, teamId: envTeam, keyId: envKey, privateKey: envPriv, source: 'env' }
  return null
}

// ─── SMTP (e-mails réels : code de connexion, réinitialisation…) ─────────────

export interface SmtpCredentials {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  source: 'bdd' | 'env'
}

export async function getSmtpCredentials(): Promise<SmtpCredentials | null> {
  const [dbHost, dbPort, dbUser, dbPass, dbFrom] = await Promise.all([
    getServerSetting(SERVER_SETTING_KEYS.smtpHost),
    getServerSetting(SERVER_SETTING_KEYS.smtpPort),
    getServerSetting(SERVER_SETTING_KEYS.smtpUser),
    getServerSetting(SERVER_SETTING_KEYS.smtpPass),
    getServerSetting(SERVER_SETTING_KEYS.smtpFrom),
  ])

  if (dbHost && dbUser && dbPass) {
    const port = Number(dbPort ?? '587')
    return {
      host: dbHost,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure: port === 465,
      user: dbUser,
      pass: dbPass,
      from: dbFrom?.trim() || dbUser,
      source: 'bdd',
    }
  }

  // Repli : variables d'environnement (configuration historique)
  const envHost = process.env.SMTP_HOST?.trim()
  const envUser = process.env.SMTP_USER?.trim()
  const envPass = process.env.SMTP_PASS?.trim()
  if (envHost && envUser && envPass) {
    const port = Number(process.env.SMTP_PORT ?? '587')
    return {
      host: envHost,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure: port === 465,
      user: envUser,
      pass: envPass,
      from: process.env.SMTP_FROM?.trim() || envUser,
      source: 'env',
    }
  }
  return null
}

// ─── Propriétaire du serveur ─────────────────────────────────────────────────
// Le premier compte créé est propriétaire : c'est lui qui configure les
// fournisseurs depuis l'interface. Les autres comptes voient l'état, sans
// pouvoir modifier quoi que ce soit.

export async function getOwnerId(): Promise<string | null> {
  const first = await db.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return first?.id ?? null
}

export async function isOwner(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const ownerId = await getOwnerId()
  return ownerId !== null && ownerId === userId
}

// ─── Masquage (réponses API — jamais de secret en clair) ─────────────────────

export function maskSecret(value: string): string {
  const v = value.trim()
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••••••${v.slice(-4)}`
}
