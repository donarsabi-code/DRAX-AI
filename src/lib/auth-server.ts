/**
 * Couche serveur d'authentification et de sécurité — DRAX IA Chat
 *
 * - Hachage des mots de passe : bcryptjs (10 rounds)
 * - Sessions opaques : token aléatoire 32 octets, seul son hachage SHA-256 est stocké en BDD
 * - Cookie httpOnly + sameSite=lax (+ secure en production)
 * - Rate limiting mémoire à fenêtre fixe (anti-abus)
 * - Validation systématique des entrées avec Zod
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

// ─── Constantes ──────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'lumen_session'
const SESSION_TTL_DAYS = 30
const BCRYPT_ROUNDS = 10

export const LIMITS = {
  messageMaxLength: 32_000,        // caractères par message
  displayNameMin: 2,
  displayNameMax: 40,
  passwordMin: 8,
  passwordMax: 200,
  attachmentMaxBytes: 10 * 1024 * 1024, // 10 Mo
} as const

// ─── Hachage ─────────────────────────────────────────────────────────────────

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  installGuideDismissed: boolean
  createdAt: Date
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/** Crée une session en base et retourne le token brut (à mettre dans le cookie). */
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken()
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt: sessionExpiry(),
    },
  })
  return token
}

/** Résout l'utilisateur courant depuis le cookie de session. Null si invalide/expiré. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return null
  return resolveSessionToken(raw)
}

/** Variante utilisable en dehors d'un contexte de requête (token explicite). */
export async function resolveSessionToken(rawToken: string): Promise<AuthUser | null> {
  const tokenHash = sha256(rawToken)
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl,
    bio: session.user.bio ?? null,
    installGuideDismissed: session.user.installGuideDismissed,
    createdAt: session.user.createdAt,
  }
}

/** Révoque la session courante (déconnexion). */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return
  await db.session.deleteMany({ where: { tokenHash: sha256(raw) } })
}

// ─── Cookies ─────────────────────────────────────────────────────────────────

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    path: '/',
  }
}

// ─── Rate limiting (fenêtre fixe, mémoire locale) ────────────────────────────

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Nettoyage périodique pour éviter la fuite mémoire
const GC_INTERVAL = 5 * 60 * 1000
let gcTimer: ReturnType<typeof setInterval> | null = null

function ensureGc() {
  if (gcTimer) return
  gcTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }, GC_INTERVAL)
  // Ne pas bloquer la fin du process Node
  if (typeof gcTimer === 'object' && 'unref' in gcTimer) (gcTimer as { unref: () => void }).unref()
}

/**
 * Renvoie true si l'action est autorisée, false si la limite est dépassée.
 * @param key   identifiant (ex. "chat:userId" ou "login:ip")
 * @param max   nombre max d'appels par fenêtre
 * @param windowMs taille de la fenêtre en ms
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  ensureGc()
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

/** Extraction d'une IP client raisonnable derrière le gateway. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'inconnu'
}

// ─── Validation Zod ──────────────────────────────────────────────────────────

import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Adresse e-mail trop courte')
  .max(254, 'Adresse e-mail trop longue')
  .email('Adresse e-mail invalide')

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Le mot de passe doit contenir au moins ${LIMITS.passwordMin} caractères`)
  .max(LIMITS.passwordMax, 'Mot de passe trop long')

export const displayNameSchema = z
  .string()
  .trim()
  .min(LIMITS.displayNameMin, `Le nom doit contenir au moins ${LIMITS.displayNameMin} caractères`)
  .max(LIMITS.displayNameMax, `Le nom ne doit pas dépasser ${LIMITS.displayNameMax} caractères`)

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Le message ne peut pas être vide')
  .max(LIMITS.messageMaxLength, `Le message ne doit pas dépasser ${LIMITS.messageMaxLength} caractères`)

/** Nettoyage basique anti-injection pour les entrées textuelles libres (titres…). */
export function sanitizeText(input: string, maxLen: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen)
}

// ─── Réponses JSON standardisées ─────────────────────────────────────────────

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status })
}

export function unauthorized() {
  return jsonError('Authentification requise.', 401)
}

export function tooMany() {
  return jsonError('Trop de requêtes. Veuillez patienter avant de réessayer.', 429)
}
