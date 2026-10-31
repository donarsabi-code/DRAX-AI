/** Client API frontend — DRAX IA Chat */

import type {
  AuthUser,
  AiInfo,
  ChatMessage,
  ChatStreamEvent,
  ConversationSummary,
  FluxEventsResponse,
  FluxSummaryResponse,
  ImageGenResponse,
  SearchResult,
  SessionInfo,
  UsageStats,
  WebSource,
} from '@/lib/types'

class ApiError extends Error {
  status: number
  errorType?: string
  constructor(message: string, status: number, errorType?: string) {
    super(message)
    this.status = status
    this.errorType = errorType
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('Connexion au serveur impossible. Vérifiez votre réseau.', 0, 'network')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? 'Une erreur est survenue.',
      response.status,
      (data as { errorType?: string }).errorType,
    )
  }
  return data as T
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  me: () => request<{ user: AuthUser | null; ai: AiInfo }>('/api/auth/me'),
  register: (body: { email: string; password: string; displayName: string }) =>
    request<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean; message: string; devResetToken?: string }>('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
  /** Fournisseurs disponibles (configurés côté serveur) */
  providers: () => request<{ google: boolean; apple: boolean; emailCode: boolean }>('/api/auth/providers'),
  /** Demande d'un code à 6 chiffres par e-mail (connexion ou inscription) */
  requestOtp: (email: string) =>
    request<{
      ok: boolean
      isNewAccount: boolean
      delivery: 'email' | 'dev'
      devCode?: string
      message: string
    }>('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email }) }),
  /** Vérification du code → session (connexion) ou création de compte (inscription) */
  verifyOtp: (body: { email: string; code: string; displayName?: string }) =>
    request<{ ok: boolean; isNewUser: boolean; user: AuthUser }>('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ─── Profil ──────────────────────────────────────────────────────────────────

export const profileApi = {
  update: (body: {
    displayName?: string
    bio?: string | null
    aiModel?: 'fast' | 'reasoning'
    installGuideDismissed?: boolean
  }) =>
    request<{ user: AuthUser }>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: (password: string) =>
    request<{ ok: boolean; message: string }>('/api/profile', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
  /** Statistiques d'utilisation (Dashboard) */
  stats: () => request<{ stats: UsageStats }>('/api/profile/stats'),
  /** Sessions actives */
  sessions: () => request<{ sessions: SessionInfo[] }>('/api/profile/sessions'),
  /** Révoque toutes les autres sessions */
  revokeOtherSessions: () =>
    request<{ ok: boolean; revoked: number }>('/api/profile/sessions', { method: 'DELETE' }),
  /** Envoi de l'avatar (multipart, image déjà redimensionnée côté client) */
  uploadAvatar: async (file: Blob): Promise<{ ok: boolean; user: AuthUser }> => {
    const form = new FormData()
    form.append('file', file, 'avatar.png')
    let response: Response
    try {
      response = await fetch('/api/profile/avatar', { method: 'POST', body: form })
    } catch {
      throw new ApiError('Connexion au serveur impossible.', 0, 'network')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ApiError((data as { error?: string }).error ?? 'Envoi impossible.', response.status)
    }
    return data as { ok: boolean; user: AuthUser }
  },
  /** Supprime l'avatar */
  removeAvatar: () => request<{ ok: boolean; user: AuthUser }>('/api/profile/avatar', { method: 'DELETE' }),
  /** Export JSON complet (téléchargement) */
  exportUrl: '/api/profile/export',
}

// ─── Conversations ───────────────────────────────────────────────────────────

export const conversationsApi = {
  list: () => request<{ conversations: ConversationSummary[] }>('/api/conversations'),
  create: () =>
    request<{ conversation: ConversationSummary }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  rename: (id: string, title: string) =>
    request<{ conversation: { id: string; title: string } }>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  messages: (id: string) =>
    request<{ conversation: { id: string; title: string }; messages: ChatMessage[] }>(
      `/api/conversations/${id}/messages`,
    ),
}

// ─── Recherche ───────────────────────────────────────────────────────────────

export const searchApi = {
  query: (q: string) =>
    request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
}

// ─── Génération d'images ─────────────────────────────────────────────────────

export const imagesApi = {
  generate: (body: {
    conversationId?: string
    prompt: string
    clientRef?: string
    size?: string
    regenerateOf?: string
  }) =>
    request<ImageGenResponse>('/api/images', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ─── Journal du flux (table ApiEvent) ────────────────────────────────────

export const fluxApi = {
  events: () => request<FluxEventsResponse>('/api/system/events'),
  summary: () => request<FluxSummaryResponse>('/api/system/summary'),
}

// ─── Configuration serveur (propriétaire = premier compte créé) ──────────────

export interface ServerConfigStatus {
  isOwner: boolean
  ownerId: string | null
  emailMode: 'real' | 'demo'
  redirectUris: { google: string; apple: string }
  google: { configured: boolean; source: 'bdd' | 'env' | null; clientIdMasked: string | null }
  apple: { configured: boolean; source: 'bdd' | 'env' | null; clientIdMasked: string | null }
  smtp: {
    configured: boolean
    source: 'bdd' | 'env' | null
    host: string | null
    port: number | null
    user: string | null
    from: string | null
    passMasked: string | null
  }
}

export type ServerConfigPut =
  | { section: 'google'; clientId: string; clientSecret: string }
  | { section: 'apple'; clientId: string; teamId: string; keyId: string; privateKey: string }
  | { section: 'smtp'; host: string; port: number; user: string; pass: string; from?: string }
  | { section: 'test-smtp'; to: string }

export const serverConfigApi = {
  get: () => request<ServerConfigStatus>('/api/admin/server-config'),
  update: (body: ServerConfigPut) =>
    request<{ ok: boolean; status?: ServerConfigStatus; message: string }>(
      '/api/admin/server-config',
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  reset: (section: 'google' | 'smtp' | 'apple') =>
    request<{ ok: boolean; status: ServerConfigStatus; message: string }>(
      `/api/admin/server-config?section=${section}`,
      { method: 'DELETE' },
    ),
}

// ─── Chat en streaming ───────────────────────────────────────────────────────

export interface ChatRequestBody {
  conversationId?: string
  content?: string
  clientRef?: string
  webSearch?: boolean
  regenerateOf?: string
  /** Modèle choisi dans le sélecteur : "fast" | "reasoning" */
  model?: 'fast' | 'reasoning'
}

/**
 * Lance une génération et appelle onEvent pour chaque événement SSE reçu.
 * Retourne une fonction d'annulation (abandon client → le serveur persiste
 * la réponse partielle avec le statut "cancelled").
 */
export function streamChat(
  body: ChatRequestBody,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): { cancel: () => void; done: Promise<void> } {
  const controller = new AbortController()
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const done = (async () => {
    let response: Response
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      if (controller.signal.aborted) return
      throw new ApiError('Connexion au serveur impossible. Vérifiez votre réseau.', 0, 'network')
    }

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}))
      throw new ApiError(
        (data as { error?: string }).error ?? 'La génération a échoué.',
        response.status,
        (data as { errorType?: string }).errorType,
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done: finished, value } = await reader.read()
      if (finished) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatStreamEvent)
        } catch {
          // événement malformé ignoré
        }
      }
    }
  })()

  return {
    cancel: () => controller.abort(),
    done,
  }
}

export { ApiError }
