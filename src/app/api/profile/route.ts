import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  getCurrentUser,
  displayNameSchema,
  sanitizeText,
  jsonError,
  unauthorized,
  rateLimit,
  tooMany,
} from '@/lib/auth-server'
import { resolveModelKey } from '@/lib/ai-provider'
import { logApiEvent } from '@/lib/flux'

/**
 * Met à jour le profil complet (Dashboard) :
 * nom affiché, bio, avatar (URL interne /api/profile/avatar ou URL externe),
 * modèle IA préféré, état du guide d'installation.
 */
export async function PATCH(req: NextRequest) {
  const fluxStarted = Date.now()
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`profile:${user.id}`, 60, 60 * 1000)) return tooMany()

    const patchSchema = z.object({
      displayName: displayNameSchema.optional(),
      // Avatar : URL absolue (https) ou chemin interne /api/… (upload) — jamais d'URL javascript:
      avatarUrl: z
        .string()
        .max(500, 'URL d\'avatar trop longue.')
        .refine((v) => v === '' || v.startsWith('/') || /^https:\/\//i.test(v), 'URL d\'avatar invalide.')
        .optional()
        .nullable(),
      // Bio courte (280 caractères max)
      bio: z.string().max(280, 'La bio ne peut pas dépasser 280 caractères.').optional().nullable(),
      // Préférence de modèle IA : "fast" | "reasoning" (sélecteur en haut du chat)
      aiModel: z.string().max(20).optional(),
      // Guide d'installation fermé (« Plus tard » / « J'ai installé »)
      installGuideDismissed: z.boolean().optional(),
    })
    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)

    const data: {
      displayName?: string
      avatarUrl?: string | null
      bio?: string | null
      aiModel?: string
      installGuideDismissed?: boolean
    } = {}
    if (parsed.data.displayName !== undefined) {
      data.displayName = sanitizeText(parsed.data.displayName, 40)
    }
    if (parsed.data.avatarUrl !== undefined) {
      data.avatarUrl = parsed.data.avatarUrl === '' ? null : parsed.data.avatarUrl
    }
    if (parsed.data.bio !== undefined) {
      const bio = parsed.data.bio ? sanitizeText(parsed.data.bio, 280) : null
      data.bio = bio === '' ? null : bio
    }
    if (parsed.data.aiModel !== undefined) {
      data.aiModel = resolveModelKey(parsed.data.aiModel)
    }
    if (parsed.data.installGuideDismissed !== undefined) {
      data.installGuideDismissed = parsed.data.installGuideDismissed
    }
    if (Object.keys(data).length === 0) return jsonError('Aucune modification fournie.', 400)

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        aiModel: true,
        installGuideDismissed: true,
      },
    })

    logApiEvent({
      route: '/api/profile',
      action: 'profile.update',
      method: 'PATCH',
      status: 200,
      startedAt: fluxStarted,
      userId: user.id,
      meta: { aiModel: updated.aiModel, renamed: data.displayName !== undefined, bio: data.bio !== undefined },
    })

    return Response.json({ user: updated })
  } catch (error) {
    console.error('[profile PATCH]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

/**
 * Suppression définitive du compte.
 * Sécurité : le mot de passe actuel est exigé. Suppression en cascade de
 * conversations, messages, pièces jointes et sessions (onDelete: Cascade).
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`profile-delete:${user.id}`, 3, 10 * 60 * 1000)) return tooMany()

    const bodySchema = z.object({ password: z.string().min(1, 'Mot de passe requis.').max(200) })
    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Mot de passe requis.', 400)

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return jsonError('Compte introuvable.', 404)

    const { verifyPassword } = await import('@/lib/auth-server')
    // Compte sans mot de passe (Google / Apple / code e-mail) : la confirmation
    // exige de taper exactement SUPPRIMER dans le champ prévu.
    const valid = dbUser.passwordHash
      ? await verifyPassword(parsed.data.password, dbUser.passwordHash)
      : parsed.data.password === 'SUPPRIMER'
    if (!valid) return jsonError('Mot de passe incorrect.', 403)

    await db.user.delete({ where: { id: user.id } })

    const { SESSION_COOKIE, sessionCookieOptions } = await import('@/lib/auth-server')
    const options = sessionCookieOptions()
    const res = Response.json({ ok: true, message: 'Compte définitivement supprimé.' })
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=${options.path}; Max-Age=0; HttpOnly; SameSite=Lax${options.secure ? '; Secure' : ''}`,
    )
    return res
  } catch (error) {
    console.error('[profile DELETE]', error)
    return jsonError('Erreur serveur lors de la suppression du compte.', 500)
  }
}
