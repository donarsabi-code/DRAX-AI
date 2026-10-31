/**
 * État des fournisseurs de connexion — DRAX IA Chat
 * GET /api/auth/providers
 * Permet à l'UI d'afficher (ou griser proprement) Google / Apple / e-mail.
 * Aucune information sensible : uniquement des booléens de disponibilité.
 */

import { isProviderConfigured } from '@/lib/oauth'
import { isEmailConfigured } from '@/lib/mailer'

export async function GET() {
  const [google, apple, emailCode] = await Promise.all([
    isProviderConfigured('google'),
    isProviderConfigured('apple'),
    isEmailConfigured(),
  ])
  return Response.json({ google, apple, emailCode })
}
