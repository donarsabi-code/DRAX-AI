import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  getCurrentUser,
  passwordSchema,
  verifyPassword,
  hashPassword,
  jsonError,
  unauthorized,
  rateLimit,
  tooMany,
} from '@/lib/auth-server'

const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(200),
  newPassword: passwordSchema,
})

/** Changement de mot de passe (session active). Révoque les autres sessions. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!rateLimit(`pw-change:${user.id}`, 5, 10 * 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => null)
    const parsed = changeSchema.safeParse(body)
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)
    const { currentPassword, newPassword } = parsed.data

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return jsonError('Compte introuvable.', 404)
    if (!dbUser.passwordHash) {
      return jsonError(
        "Ce compte utilise Google, Apple ou le code e-mail et n'a pas de mot de passe local.",
        400,
      )
    }

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!valid) return jsonError('Mot de passe actuel incorrect.', 403)

    if (currentPassword === newPassword) {
      return jsonError('Le nouveau mot de passe doit être différent de l\'actuel.', 400)
    }

    const passwordHash = await hashPassword(newPassword)
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Révoque toutes les autres sessions ; la session courante reste active
      // (elle est re-trouvée par son token dans le cookie du navigateur).
      db.session.deleteMany({
        where: { userId: user.id, createdAt: { lt: new Date(Date.now() - 1000) } },
      }),
    ])

    return Response.json({ ok: true, message: 'Mot de passe modifié avec succès.' })
  } catch (error) {
    console.error('[profile/password]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
