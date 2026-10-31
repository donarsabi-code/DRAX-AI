/**
 * Couche d'abstraction des fournisseurs d'IA — DRAX IA Chat
 *
 * Objectif : isoler totalement les routes API du fournisseur concret.
 * Pour changer de fournisseur, implémenter l'interface ChatProvider et
 * l'enregistrer dans le registre ci-dessous. Aucune clé n'est jamais
 * exposée au frontend : tout est résolu côté serveur.
 *
 * Fournisseur par défaut : "zai" (SDK z-ai-web-dev-sdk, résolu côté serveur,
 * sans clé en dur). Un fournisseur "openai-compatible" peut être ajouté en
 * lisant OPENAI_API_KEY / OPENAI_BASE_URL depuis l'environnement serveur.
 */

import ZAI from 'z-ai-web-dev-sdk'
import type { SearchFunctionResultItem } from 'z-ai-web-dev-sdk'

export interface ChatMessageInput {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamOptions {
  messages: ChatMessageInput[]
  signal?: AbortSignal
}

export interface WebSource {
  url: string
  name: string
  snippet: string
  host_name: string
}

export interface ChatProvider {
  /** Identifiant technique du fournisseur. */
  readonly id: string
  /** Nom lisible affiché dans l'interface. */
  readonly displayName: string
  /** Nom du modèle réel utilisé (persisté avec chaque message). */
  readonly modelId: string
  /** true si la configuration serveur permet d'appeler ce fournisseur. */
  readonly available: boolean
  /** Raison d'indisponibilité (affichée à l'utilisateur si disponible=false). */
  readonly unavailableReason?: string

  /** Génère la réponse en streaming. Renvoie un itérateur de fragments de texte. */
  stream(opts: StreamOptions): AsyncIterable<string>
  /** Génère la réponse complète (utilisé pour l'auto-titrage). */
  complete(opts: { messages: ChatMessageInput[]; maxTokensHint?: boolean }): Promise<string>
  /** Recherche web optionnelle. Renvoie null si non supportée. */
  searchWeb?(query: string, num?: number): Promise<WebSource[]>
}

// ─── Sélecteur de modèle (réel, testé sur le SDK) ────────────────────────────

/**
 * Deux modes réellement disponibles via le backend (test du 2026-10-31 :
 * scripts/test-models.ts → model "glm-4-plus", thinking enabled/disabled OK).
 * Aucun nom de modèle inventé : seules des capacités vérifiées sont exposées.
 */
export type AiModelKey = 'fast' | 'reasoning'

export interface AiModelChoice {
  key: AiModelKey
  displayName: string
  description: string
}

export const AI_MODELS: Record<AiModelKey, AiModelChoice> = {
  fast: {
    key: 'fast',
    displayName: 'DRAX Rapide',
    description: 'Réponses immédiates pour le quotidien (GLM, raisonnement désactivé).',
  },
  reasoning: {
    key: 'reasoning',
    displayName: 'DRAX Raisonnement',
    description: 'Réflexion approfondie avant de répondre — maths, code, analyses (GLM, raisonnement activé).',
  },
}

/** Clé valide ou valeur par défaut (« fast »). Aucune autre valeur n'est acceptée. */
export function resolveModelKey(input: unknown): AiModelKey {
  return input === 'reasoning' ? 'reasoning' : 'fast'
}

// ─── Fournisseur ZAI (GLM) ───────────────────────────────────────────────

class ZaiProvider implements ChatProvider {
  readonly id = 'zai'
  readonly displayName: string
  readonly modelId = 'glm-4-plus'
  readonly thinkingType: 'enabled' | 'disabled'

  constructor(thinkingType: 'enabled' | 'disabled' = 'disabled') {
    this.thinkingType = thinkingType
    this.displayName = thinkingType === 'enabled' ? AI_MODELS.reasoning.displayName : AI_MODELS.fast.displayName
  }

  private zaiPromise: Promise<ZAI> | null = null

  private async client(): Promise<ZAI> {
    if (!this.zaiPromise) {
      this.zaiPromise = ZAI.create()
    }
    return this.zaiPromise
  }

  readonly available = true

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const zai = await this.client()
    const upstream = (await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        ...opts.messages,
      ],
      stream: true,
      thinking: { type: this.thinkingType },
    })) as ReadableStream<Uint8Array>

    const reader = upstream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (opts.signal?.aborted) {
          await reader.cancel().catch(() => undefined)
          return
        }
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') return
          try {
            const json = JSON.parse(payload)
            const delta: string | undefined = json.choices?.[0]?.delta?.content
            if (delta) yield delta
          } catch {
            // Fragment SSE incomplet ou non-JSON : on ignore proprement.
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async complete(opts: { messages: ChatMessageInput[] }): Promise<string> {
    const zai = await this.client()
    const completion = await zai.chat.completions.create({
      messages: opts.messages,
      thinking: { type: this.thinkingType },
    })
    const content = completion?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      throw new Error('Réponse vide du fournisseur IA.')
    }
    return content
  }

  async searchWeb(query: string, num = 5): Promise<WebSource[]> {
    const zai = await this.client()
    const results = (await zai.functions.invoke('web_search', {
      query,
      num,
    })) as SearchFunctionResultItem[]
    return results.map((r) => ({
      url: r.url,
      name: r.name,
      snippet: r.snippet,
      host_name: r.host_name,
    }))
  }
}

// ─── Fournisseur "openai-compatible" (activable via variables d'environnement) ─

class OpenAICompatibleProvider implements ChatProvider {
  readonly id = 'openai-compatible'
  readonly displayName: string
  readonly modelId: string
  readonly available: boolean
  readonly unavailableReason?: string

  private baseUrl: string
  private apiKey: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? ''
    this.baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
    this.modelId = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    this.displayName = process.env.OPENAI_MODEL ?? 'openai-compatible'
    this.available = this.apiKey.length > 0
    this.unavailableReason = this.available
      ? undefined
      : 'Variable OPENAI_API_KEY absente de la configuration serveur.'
  }

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...opts.messages,
        ],
        stream: true,
      }),
      signal: opts.signal,
    })
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      throw new Error(`Fournisseur IA: erreur ${response.status}. ${text.slice(0, 300)}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') return
          try {
            const json = JSON.parse(payload)
            const delta: string | undefined = json.choices?.[0]?.delta?.content
            if (delta) yield delta
          } catch {
            // ignore
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async complete(opts: { messages: ChatMessageInput[] }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: opts.messages,
      }),
    })
    if (!response.ok) {
      throw new Error(`Fournisseur IA: erreur ${response.status}`)
    }
    const json = await response.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content) throw new Error('Réponse vide du fournisseur IA.')
    return content
  }
}

// ─── Registre / sélection ────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Tu es DRAX IA, un assistant conversationnel francophone, utile, précis et bienveillant.
Réponds dans la langue de l'utilisateur. Structure tes réponses avec du Markdown quand cela améliore la lisibilité (listes, tableaux, blocs de code avec le langage indiqué).
Ne prétends jamais avoir fait une recherche internet sauf si des résultats de recherche te sont fournis dans le message.
L'application sait générer des images : quand l'utilisateur demande clairement une image, elle est produite automatiquement par l'application et apparaît dans la conversation (les images déjà créées apparaissent comme « [image générée par DRAX IA] » dans l'historique). Tu ne peux pas créer d'image toi-même : n'invente jamais de lien d'image ; si une demande d'image n'a pas été satisfaite, invite simplement l'utilisateur à reformuler sa demande (ex. « Génère une image de … »).`

export function getChatProvider(modelKey: unknown = 'fast'): ChatProvider {
  const requested = (process.env.AI_PROVIDER ?? 'zai').toLowerCase()
  if (requested === 'openai-compatible') {
    return new OpenAICompatibleProvider()
  }
  const key = resolveModelKey(modelKey)
  return new ZaiProvider(key === 'reasoning' ? 'enabled' : 'disabled')
}

/** Génère un titre court pour une conversation (utilisé après le premier échange). */
export async function generateConversationTitle(
  provider: ChatProvider,
  userMessage: string,
  assistantMessage: string,
): Promise<string | null> {
  try {
    const raw = await provider.complete({
      messages: [
        {
          role: 'user',
          content: `Donne un titre très court (3 à 6 mots maximum, sans guillemets, sans point final) résumant le sujet de cet échange. Réponds uniquement avec le titre.\n\nMessage utilisateur : ${userMessage.slice(0, 500)}\n\nRéponse de l'assistant : ${assistantMessage.slice(0, 500)}`,
        },
      ],
    })
    const title = raw.trim().replace(/^["'«»\s]+|["'«».\s]+$/g, '').slice(0, 80)
    return title.length >= 2 ? title : null
  } catch {
    return null
  }
}

/** Classe une erreur IA en catégorie exploitable par le frontend. */
export function classifyAiError(error: unknown): 'quota' | 'auth' | 'network' | 'config' | 'unknown' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('429') || message.includes('rate') || message.includes('quota')) return 'quota'
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('token')) return 'auth'
  if (message.includes('fetch') || message.includes('network') || message.includes('econn') || message.includes('timeout')) return 'network'
  if (message.includes('key') || message.includes('config') || message.includes('baseurl')) return 'config'
  return 'unknown'
}
