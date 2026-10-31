/**
 * Stockage des fichiers applicatifs — DRAX AI Chat
 *
 * Deux environnements, un seul code :
 *  - Serveur classique (sandbox, VPS, Docker) : disque persistant disponible
 *    → les images générées et les avatars sont écrits dans des dossiers privés.
 *  - Plateformes sans disque persistant (Vercel et autres serverless) : le
 *    système de fichiers est en lecture seule pendant l'exécution
 *    → les mêmes fichiers sont stockés EN BASE (base64), avec un plafond
 *    de taille adapté (600 Ko avatar, 4 Mo image générée).
 *
 * La détection est automatique : si `STORAGE_DRIVER=bdd` est défini OU que
 * l'environnement est Vercel (`VERCEL=1`), la base est utilisée. En local,
 * le disque reste utilisé (plus économe) sans aucune configuration.
 */

import { mkdir, writeFile, readFile, unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

/** Taille maximale d'une image générée stockée en base. */
export const BDD_IMAGE_MAX_BYTES = 4 * 1024 * 1024
/** Taille maximale d'un avatar (identique à la validation de la route). */
export const BDD_AVATAR_MAX_BYTES = 600 * 1024

export function isBddStorage(): boolean {
  return process.env.STORAGE_DRIVER === 'bdd' || process.env.VERCEL === '1'
}

/* ─── Images générées ──────────────────────────────────────────────────────── */

export interface StoredImage {
  /** Chemin disque si stockage fichier, sinon chaîne vide. */
  storagePath: string
  /** Base64 si stockage base, sinon null. */
  dataBase64: string | null
  fileName: string
}

/**
 * Stocke une image générée : en base (Vercel) ou dans le dossier privé
 * `db/generated-images` (serveur classique). Retourne les références à
 * persister sur l'enregistrement Attachment.
 */
export async function storeGeneratedImage(
  buffer: Buffer,
  fileName: string,
): Promise<StoredImage> {
  if (isBddStorage()) {
    if (buffer.length > BDD_IMAGE_MAX_BYTES) {
      const err = new Error(
        "L'image générée dépasse la taille autorisée par ce serveur. Réessayez.",
      ) as Error & { errorType?: string }
      err.errorType = 'unknown'
      throw err
    }
    return { storagePath: `bdd:${fileName}`, dataBase64: buffer.toString('base64'), fileName }
  }
  const storagePath = path.join(process.cwd(), 'db', 'generated-images', fileName)
  await mkdir(path.dirname(storagePath), { recursive: true })
  await writeFile(storagePath, buffer)
  return { storagePath, dataBase64: null, fileName }
}

/** Lit le contenu d'un enregistrement Attachment, base ou disque. */
export async function readAttachmentFile(
  attachment: { storagePath: string; dataBase64?: string | null },
): Promise<Buffer | null> {
  if (attachment.dataBase64) {
    return Buffer.from(attachment.dataBase64, 'base64')
  }
  if (!attachment.storagePath || attachment.storagePath.startsWith('bdd:')) return null
  try {
    return await readFile(attachment.storagePath)
  } catch {
    return null
  }
}

/** Supprime le fichier disque d'un Attachment si présent (sans échouer). */
export async function deleteAttachmentFile(storagePath: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('bdd:')) return
  await unlink(storagePath).catch(() => {})
}

/* ─── Avatars ──────────────────────────────────────────────────────────────── */

/**
 * Stocke l'avatar d'un utilisateur : en base (User.avatarData, Vercel) ou
 * dans `var/avatars` (serveur classique). Un seul fichier par utilisateur.
 */
export async function storeAvatar(
  userId: string,
  bytes: Buffer,
  ext: 'png' | 'jpg' | 'webp',
): Promise<void> {
  if (isBddStorage()) {
    if (bytes.length > BDD_AVATAR_MAX_BYTES) {
      throw new Error('Image trop lourde pour ce serveur (600 Ko maximum).')
    }
    await db.user.update({
      where: { id: userId },
      data: { avatarData: bytes.toString('base64'), avatarExt: ext },
    })
    return
  }
  const dir = path.join(process.cwd(), 'var', 'avatars')
  await mkdir(dir, { recursive: true })
  for (const e of ['png', 'jpg', 'webp']) {
    await unlink(path.join(dir, `${userId}.${e}`)).catch(() => {})
  }
  await writeFile(path.join(dir, `${userId}.${ext}`), bytes)
}

/** Lit l'avatar d'un utilisateur, base ou disque. */
export async function readAvatar(
  userId: string,
): Promise<{ bytes: Buffer; mime: 'image/png' | 'image/jpeg' | 'image/webp' } | null> {
  if (isBddStorage()) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { avatarData: true, avatarExt: true },
    })
    if (!user?.avatarData) return null
    const mime =
      user.avatarExt === 'jpg'
        ? 'image/jpeg'
        : user.avatarExt === 'webp'
          ? 'image/webp'
          : 'image/png'
    return { bytes: Buffer.from(user.avatarData, 'base64'), mime }
  }
  for (const e of ['png', 'jpg', 'webp'] as const) {
    try {
      const file = await readFile(path.join(process.cwd(), 'var', 'avatars', `${userId}.${e}`))
      const mime = e === 'png' ? 'image/png' : e === 'jpg' ? 'image/jpeg' : 'image/webp'
      return { bytes: file, mime }
    } catch {
      // essaie l'extension suivante
    }
  }
  return null
}

/** Supprime l'avatar (base ET disque) d'un utilisateur. */
export async function deleteAvatar(userId: string): Promise<void> {
  await db.user.updateMany({ where: { id: userId }, data: { avatarData: null, avatarExt: null } })
  for (const e of ['png', 'jpg', 'webp']) {
    await unlink(path.join(process.cwd(), 'var', 'avatars', `${userId}.${e}`)).catch(() => {})
  }
}
