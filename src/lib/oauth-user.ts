/**
 * Résolution / création d'utilisateur après OAuth — DRAX IA Chat
 *
 * Stratégie de liaison sûre :
 *  1. un lien (provider, providerAccountId) existant → session directe ;
 *  2. sinon, un compte DRAX IA avec le MÊME e-mail vérifié → lien + session
 *     (pas de duplication de compte) ;
 *  3. sinon, création d'un nouveau compte sans mot de passe local.
 */

import { db } from '@/lib/db'
import { createSession } from '@/lib/auth-server'
import type { OAuthIdentity, OAuthProvider } from '@/lib/oauth'

export interface OAuthResolution {
  userId: string
  isNewUser: boolean
  sessionToken: string
}

export async function resolveOAuthUser(
  provider: OAuthProvider,
  identity: OAuthIdentity,
): Promise<OAuthResolution> {
  // 1. Lien fournisseur déjà connu
  const existingLink = await db.oauthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: identity.providerAccountId } },
    include: { user: true },
  })
  if (existingLink) {
    // Rafraîchit l'avatar si Google en fournit un
    if (identity.avatarUrl && identity.avatarUrl !== existingLink.user.avatarUrl) {
      await db.user.update({
        where: { id: existingLink.userId },
        data: { avatarUrl: identity.avatarUrl },
      })
    }
    const sessionToken = await createSession(existingLink.userId)
    return { userId: existingLink.userId, isNewUser: false, sessionToken }
  }

  // 2. Compte existant avec le même e-mail (vérifié par le fournisseur)
  const emailUser = await db.user.findUnique({ where: { email: identity.email } })
  if (emailUser) {
    await db.oauthAccount.create({
      data: {
        userId: emailUser.id,
        provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
      },
    })
    if (identity.avatarUrl && !emailUser.avatarUrl) {
      await db.user.update({ where: { id: emailUser.id }, data: { avatarUrl: identity.avatarUrl } })
    }
    const sessionToken = await createSession(emailUser.id)
    return { userId: emailUser.id, isNewUser: false, sessionToken }
  }

  // 3. Nouveau compte (aucun mot de passe local : connexion par fournisseur)
  const created = await db.user.create({
    data: {
      email: identity.email,
      passwordHash: null,
      displayName: identity.displayName.slice(0, 40) || identity.email.split('@')[0],
      avatarUrl: identity.avatarUrl,
      oauthAccounts: {
        create: {
          provider,
          providerAccountId: identity.providerAccountId,
          email: identity.email,
        },
      },
    },
  })
  const sessionToken = await createSession(created.id)
  return { userId: created.id, isNewUser: true, sessionToken }
}
