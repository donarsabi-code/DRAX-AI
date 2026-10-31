/** Types partagés frontend — DRAX IA Chat */

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  bio?: string | null
  installGuideDismissed?: boolean
  createdAt?: string
  /** Modèle IA préféré (sélecteur en haut du chat) */
  aiModel?: 'fast' | 'reasoning'
}

/** Statistiques d'utilisation personnelles (Dashboard) */
export interface UsageStats {
  conversations: number
  messagesTotal: number
  messages30d: number
  imagesGenerated: number
  webSearches: number
  apiEvents: number
  activeDays: number
  streak: number
  memberSince: string | null
  avgPerDay: number
  daily: { day: string; count: number }[]
}

/** Session active (Dashboard → Sécurité) */
export interface SessionInfo {
  id: string
  createdAt: string
  expiresAt: string
  current: boolean
}

export interface AiModelChoice {
  key: 'fast' | 'reasoning'
  displayName: string
  description: string
}

export interface AiInfo {
  providerId: string
  displayName: string
  modelId: string
  available: boolean
  unavailableReason: string | null
  /** Modèles réellement disponibles (2 modes) — rempli par /api/auth/me */
  models?: AiModelChoice[]
}

/** Entrée du journal du flux (table ApiEvent) */
export interface ApiEventEntry {
  id: string
  route: string
  action: string
  method: string
  status: number
  durationMs: number
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface ApiEventStats {
  action: string
  count: number
}

export interface FluxEventsResponse {
  events: ApiEventEntry[]
  stats: ApiEventStats[]
}

export interface FluxSummaryResponse {
  totals: {
    conversations: number
    messages: number
    assistantMessages: number
    imagesGenerated: number
    errors: number
  }
  byModel: { model: string; count: number }[]
  byAction: { action: string; count: number }[]
  generatedAt: string
}

export interface WebSource {
  url: string
  name: string
  snippet: string
  host_name: string
}

export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'completed' | 'cancelled' | 'error' | 'pending' | 'streaming'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  model: string | null
  status: MessageStatus
  errorType: string | null
  sources: WebSource[] | null
  createdAt: string
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string | null
}

/** Événements SSE émis par /api/chat */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; conversationTitle: string; userMessageId: string; model: string; providerDisplayName: string; modelKey?: 'fast' | 'reasoning' }
  | { type: 'sources'; sources: WebSource[] }
  | { type: 'image_start' }
  | { type: 'delta'; text: string }
  | { type: 'title'; conversationId: string; title: string }
  | { type: 'done'; messageId: string; status: 'completed' | 'cancelled' }
  | { type: 'error'; errorType: string; messageId: string | null; message: string }

export interface SearchResult {
  conversationId: string
  title: string
  updatedAt: string
  matchType: 'title' | 'message'
  snippet: string | null
  messageRole: string | null
}

/** Réponse de /api/images (génération d'image, non streamée) */
export interface ImageGenResponse {
  conversation: { id: string; title: string }
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}
