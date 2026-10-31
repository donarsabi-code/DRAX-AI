'use client'

/**
 * Zone de discussion — DRAX IA Chat
 * - État vide avec invitations de départ (comme la page d'accueil publique de ChatGPT)
 * - Défilement automatique contrôlé : suit la génération uniquement si
 *   l'utilisateur est déjà proche du bas ; bouton "revenir en bas" sinon
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { MessageItem } from '@/components/chat/message-item'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ChatAreaProps {
  messages: ChatMessage[]
  generating: boolean
  userName: string
  onRegenerate: () => void
  onRetryError: (messageId: string) => void
  onSuggestion: (text: string) => void
}

const SUGGESTIONS = [
  { title: 'Explique-moi simplement', text: 'Explique-moi simplement ce qu’est un algorithme de recommandation.' },
  { title: 'Aide-moi à écrire', text: 'Aide-moi à rédiger un e-mail professionnel pour reporter une réunion.' },
  { title: 'Résume un sujet', text: 'Résume les grandes étapes de la conquête spatiale en 5 points.' },
  { title: 'Aide au code', text: 'Écris une fonction JavaScript qui valide une adresse e-mail, avec des tests.' },
]

const SCROLL_THRESHOLD = 120 // px du bas pour considérer "collé en bas"

export function ChatArea({
  messages,
  generating,
  userName,
  onRegenerate,
  onRetryError,
  onSuggestion,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance < SCROLL_THRESHOLD)
  }, [])

  // Défilement automatique contrôlé pendant la génération
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !atBottom) return
    el.scrollTop = el.scrollHeight
  }, [messages, atBottom])

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setAtBottom(true)
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain"
        role="log"
        aria-live="polite"
        aria-label="Fil de discussion"
      >
        {messages.length === 0 ? (
          <EmptyState userName={userName} onSuggestion={onSuggestion} />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 py-6 pb-10">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                isLastAssistant={m.id === lastAssistantId}
                generating={generating}
                onRegenerate={onRegenerate}
                onRetry={() => onRetryError(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bouton revenir en bas */}
      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Revenir en bas du fil"
          className="absolute bottom-4 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
    </div>
  )
}

function EmptyState({ userName, onSuggestion }: { userName: string; onSuggestion: (t: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10" data-testid="empty-state">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          <path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6L19 15z" />
        </svg>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
        {userName ? `Bonjour, ${userName} !` : 'Bonjour !'}
      </h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Sur quoi travaillons-nous aujourd&apos;hui ?
      </p>
      <div className="mt-7 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2" role="list" aria-label="Suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            role="listitem"
            onClick={() => onSuggestion(s.text)}
            className="rounded-2xl border bg-card px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-sm font-medium">{s.title}</span>
            <span className={cn('mt-0.5 block line-clamp-2 text-xs text-muted-foreground')}>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
