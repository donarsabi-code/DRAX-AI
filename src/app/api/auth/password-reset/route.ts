import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { emailSchema, sha256, rateLimit, clientIp, jsonError, tooMany } from '@/lib/auth-server'

const requestSchema = z.object({ email: emailSchema })

/**
 * Demande de réinitialisation de mot de passe.
 *
 * DÉPENDANCE EXTERNE (documentée) : l'envoi d'e-mail nécessite un fournisseur
 * SMTP / e-mail transactionnel (ex. Resend, Postmark) non configuré dans cet
 * environnement. Comportement :
 *  - Production : réponse générique (pas d'énumération de comptes). Le token est
 *    créé en base ; l'intégration e-mail est à brancher (voir README § Réinitialisation).
 *  - Développement (NODE_ENV !== 'production') : le token est renvoyé dans la
 *    réponse pour permettre de tester le parcours complet, comportement
 *    explicitement identifié comme réservé au développement.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers)
    if (!rateLimit(`pwreset:${ip}`, 5, 10 * 60 * 1000)) return tooMany()

    const body = await req.json().catch(() => null)
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return jsonError('Adresse e-mail invalide.', 400)
    const { email } = parsed.data

    const generic = { ok: true, message: "Si un compte existe avec cette adresse, une procédure de réinitialisation a été initiée." }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) return Response.json(generic)

    const token = randomBytes(24).toString('hex')
    await db.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: sha256(token),
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 h
      },
    })

    if (process.env.NODE_ENV !== 'production') {
      return Response.json({ ...generic, devResetToken: token })
    }
    return Response.json(generic)
  } catch (error) {
    console.error('[password-reset]', error)
    return jsonError('Erreur serveur.', 500)
  }
}

// Empêche le hachage SHA-256 inutilisé d'être retiré à tort (référence croisée)
void createHash
