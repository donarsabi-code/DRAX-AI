import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { passwordSchema, sha256, verifyPassword, hashPassword, rateLimit, clientIp, jsonError, tooMany } from '@/lib/auth-server'

const confirmSchema = z.object({
  token: z.string().trim().min(10, 'Token invalide.').max(200),
  newPassword: passwordSchema,
})

/** Confirmation de réinitialisation : consomme le token à usage unique (1 h). */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers)
    if (!rateLimit(`pwreset-confirm:${ip}`, 10, 10 * 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => null)
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Données invalides.', 400)
    const { token, newPassword } = parsed.data

    const tokenHash = sha256(token)
    const user = await db.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpiry: { gt: new Date() },
      },
    })
    if (!user) {
      return jsonError('Lien de réinitialisation invalide ou expiré. Veuillez recommencer la procédure.', 400)
    }

    // Empêche de re-définir le même mot de passe (compte pouvant être sans mot de passe)
    const sameAsBefore = user.passwordHash
      ? await verifyPassword(newPassword, user.passwordHash)
      : false
    if (sameAsBefore) {
      return jsonError('Le nouveau mot de passe doit être différent de l\'ancien.', 400)
    }

    const passwordHash = await hashPassword(newPassword)
    // Usage unique : on efface le token + révocation de toutes les sessions existantes
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
      }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ])

    return Response.json({ ok: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' })
  } catch (error) {
    console.error('[password-reset/confirm]', error)
    return jsonError('Erreur serveur.', 500)
  }
}
