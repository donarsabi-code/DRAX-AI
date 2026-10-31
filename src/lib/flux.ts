/**
 * Journal du flux applicatif — DRAX IA Chat
 *
 * Chaque action significative de l'API (auth, chat, images, conversations,
 * recherche, profil) est écrite dans la table `ApiEvent` :
 *   route, action, méthode, code HTTP final, durée serveur, métadonnées JSON.
 *
 * Garanties :
 *  - jamais d'échec en cascade : une erreur de journalisation est ignorée ;
 *  - aucune donnée sensible : pas de contenu de message, pas de mot de passe,
 *    pas de token — uniquement des identifiants techniques et compteurs.
 *  - l'utilisateur peut consulter SON propre journal via GET /api/system/events.
 */

import { db } from '@/lib/db'
import { sanitizeText } from '@/lib/auth-server'

export interface ApiEventInput {
  route: string
  action: string
  method: string
  status: number
  startedAt: number
  userId?: string | null
  meta?: Record<string, unknown>
}

export function logApiEvent(input: ApiEventInput): void {
  // Fire-and-forget volontaire : le flux applicatif ne doit jamais attendre
  // ni échouer à cause du journal.
  void db.apiEvent
    .create({
      data: {
        route: sanitizeText(input.route, 120),
        action: sanitizeText(input.action, 60),
        method: sanitizeText(input.method, 8),
        status: input.status,
        durationMs: Math.max(0, Date.now() - input.startedAt),
        userId: input.userId ?? null,
        meta: input.meta ? safeJson(input.meta) : null,
      },
    })
    .catch((error) => {
      console.error('[flux] journalisation impossible :', error)
    })
}

function safeJson(meta: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(meta)
  } catch {
    return null
  }
}
