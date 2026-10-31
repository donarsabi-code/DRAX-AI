/**
 * Codes à usage unique (OTP) envoyés par e-mail — DRAX IA Chat
 *
 * Garanties de sécurité :
 *  - code 6 chiffres aléatoire (crypto) ;
 *  - seul le HACHAGE SHA-256 (code + sel serveur) est stocké en BDD ;
 *  - TTL 10 minutes, usage unique, maximum 5 tentatives de vérification ;
 *  - comparaison en temps constant (timingSafeEqual).
 */

import { randomInt, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { sha256 } from '@/lib/auth-server'

export const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5

/** Sel applicatif : si OTP_SECRET n'est pas défini, un sel statique dérivé du
 * secret de session est utilisé (la BDD reste la seule copie des hachés). */
function otpSalt(): string {
  return process.env.OTP_SECRET ?? 'lumen-otp-v1'
}

export function generateOtpCode(): string {
  // randomInt est cryptographiquement sûr ; 6 chiffres, zéros non significatifs conservés
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function hashCode(code: string): string {
  return sha256(`${otpSalt()}:${code}`)
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Crée et persiste un code pour l'e-mail donné, et RENVOIE le code brut.
 * L'appelant décide de l'envoyer par e-mail (SMTP) ou de le retourner en mode dev.
 * Les codes précédents non consommés deviennent inutilisables. */
export async function issueOtpCode(email: string): Promise<string> {
  const code = generateOtpCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  await db.emailOtpCode.updateMany({
    where: { email, usedAt: null },
    data: { usedAt: new Date(Date.now() - 1) },
  })
  await db.emailOtpCode.create({ data: { email, codeHash, purpose: 'auth', expiresAt } })
  return code
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' | 'too-many-attempts' }

/** Vérifie et consomme le code (usage unique). Incrémente les tentatives en cas d'échec. */
export async function verifyOtpCode(email: string, code: string): Promise<OtpVerifyResult> {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) return { ok: false, reason: 'invalid' }

  const record = await db.emailOtpCode.findFirst({
    where: { email, usedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return { ok: false, reason: 'invalid' }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    // Consomme le code pour bloquer toute nouvelle tentative
    await db.emailOtpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } })
    return { ok: false, reason: 'too-many-attempts' }
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await db.emailOtpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } })
    return { ok: false, reason: 'expired' }
  }

  const matches = constantTimeEquals(hashCode(trimmed), record.codeHash)
  if (!matches) {
    await db.emailOtpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, reason: 'invalid' }
  }

  await db.emailOtpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  return { ok: true }
}
