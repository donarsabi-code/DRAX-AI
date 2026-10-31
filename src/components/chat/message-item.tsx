'use client'

/**
 * Message — DRAX IA Chat
 * - Message utilisateur : bulle alignée à droite
 * - Réponse assistant : pleine largeur avec avatar, rendu Markdown
 * - Actions : copier, régénérer (dernier message assistant uniquement)
 * - États : en cours (curseur clignotant), annulé, erreur avec réessai
 * - Sources web affichées sous la réponse concernée
 */

import { memo, useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, Globe, RefreshCw, Sparkles } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/markdown-renderer'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MessageItemProps {
  message: ChatMessage
  isLastAssistant: boolean
  generating: boolean
  onRegenerate: () => void
  onRetry: () => void
}

const ERROR_LABELS: Record<string, string> = {
  network: 'Connexion interrompue',
  quota: 'Quota du fournisseur IA atteint',
  auth: "Erreur d'authentification IA",
  config: 'Modèle IA non configuré',
  unknown: 'La génération a échoué',
}

function Actions({
  content,
  onRegenerate,
  showRegenerate,
}: {
  content: string
  onRegenerate: () => void
  showRegenerate: boolean
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard indisponible */
    }
  }
  return (
    <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
      <button
        type="button"
        onClick={copy}
        aria-label="Copier la réponse"
        title="Copier"
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      {showRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label="Régénérer la réponse"
          title="Régénérer"
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="size-4" />
        </button>
      )}
    </div>
  )
}

export const MessageItem = memo(function MessageItem({
  message,
  isLastAssistant,
  generating,
  onRegenerate,
  onRetry,
}: MessageItemProps) {
  // ─── Message utilisateur ────────────────────────────────────────────────────
  if (message.role === 'user') {
    return (
      <div className="flex justify-end px-3 sm:px-6" data-testid="message-user">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  // ─── Réponse en erreur (persistée côté serveur) ─────────────────────────────
  if (message.status === 'error') {
    return (
      <div className="flex gap-3 px-3 sm:px-6" data-testid="message-error">
        <AssistantAvatar />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{ERROR_LABELS[message.errorType ?? 'unknown'] ?? 'La génération a échoué'}</p>
              <p className="mt-0.5 text-muted-foreground">
                {message.errorType === 'config'
                  ? "Le serveur n'a pas de clé IA valide. Contactez l'administrateur."
                  : 'Vous pouvez tenter une nouvelle génération.'}
              </p>
            </div>
          </div>
          {!generating && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="size-3.5" /> Réessayer
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── Réponse assistant ──────────────────────────────────────────────────────
  const isStreaming = message.status === 'streaming'
  return (
    <div className="group flex gap-3 px-3 sm:px-6" data-testid="message-assistant">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
        {message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : isStreaming ? (
          <div className="flex items-center gap-2 py-1 text-muted-foreground" aria-live="polite">
            <Sparkles className="size-4 animate-pulse" />
            <span className="text-sm">
              {message.model === 'lumen-image-1' ? "Génération de l'image…" : 'DRAX IA réfléchit…'}
            </span>
            <span className="cursor-blink" aria-hidden="true" />
          </div>
        ) : null}

        {isStreaming && message.content && <span className="cursor-blink align-baseline" aria-hidden="true" />}

        {message.status === 'cancelled' && (
          <p className="mt-2 text-xs text-muted-foreground">— génération interrompue —</p>
        )}

        {!isStreaming && message.content && (
          <Actions
            content={message.content}
            onRegenerate={onRegenerate}
            showRegenerate={isLastAssistant && !generating}
          />
        )}
      </div>
    </div>
  )
})

function AssistantAvatar() {
  return (
    <div
      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
      aria-hidden="true"
    >
      <Sparkles className="size-4" />
    </div>
  )
}

function Sources({ sources }: { sources: { url: string; name: string; host_name: string }[] }) {
  return (
    <div className="mb-3 rounded-xl border bg-muted/40 p-3" data-testid="web-sources">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Globe className="size-3.5" /> Sources utilisées ({sources.length})
      </p>
      <ol className="space-y-1.5">
        {sources.map((s, i) => (
          <li key={s.url + i} className="text-sm">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-start gap-1.5 text-foreground hover:text-primary"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="line-clamp-1 font-medium">{s.name}</span>
              <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-50 group-hover:opacity-100" />
            </a>
            <span className="ml-5 block text-xs text-muted-foreground">{s.host_name}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
