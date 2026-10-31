import { db } from '@/lib/db'
import { logApiEvent } from '@/lib/flux'

/**
 * Petits helpers partagés par la route avatar (évite une dépendance circulaire
 * avec auth-server pour logApiEvent : délègue au module flux existant).
 */
export { getCurrentUser, rateLimit, jsonError, unauthorized, tooMany } from '@/lib/auth-server'

export function logEventSafe(
  action: string,
  userId: string | null,
  route: string,
  method: string,
  status: number,
  meta: Record<string, unknown>,
) {
  // logApiEvent est fire-and-forget : il gère lui-même ses erreurs et ne
  // doit jamais faire échouer la requête principale.
  logApiEvent({
    route,
    action,
    method,
    status,
    startedAt: Date.now(),
    userId,
    meta,
  })
}

// db est réexporté pour usage direct dans la route
export { db }
