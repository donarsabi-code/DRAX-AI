'use client'

/**
 * Zone de saisie — DRAX IA Chat
 * - Textarea auto-redimensionnable (max ~8 lignes)
 * - Entrée = envoyer, Maj+Entrée = nouvelle ligne
 * - Bouton envoyer / bouton stop pendant la génération
 * - Bascule recherche web avec état visible
 * - Saisie vocale hybride : dictée instantanée (Web Speech API) ou
 *   enregistrement + transcription serveur (iPhone/Safari) — le texte
 *   transcrit s'ajoute au champ
 * - Cibles tactiles >= 44 px (mobile)
 */

import { useEffect, useRef } from 'react'
import { ArrowUp, Globe, Image as ImageIcon, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  generating: boolean
  webSearch: boolean
  onToggleWebSearch: (enabled: boolean) => void
  imageMode: boolean
  onToggleImageMode: (enabled: boolean) => void
  disabled?: boolean
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  generating,
  webSearch,
  onToggleWebSearch,
  imageMode,
  onToggleImageMode,
  disabled,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Référence de la valeur courante pour le callback de transcription
  const valueRef = useRef(value)

  // Synchronisation hors rendu (règle react-hooks/refs)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // Saisie vocale : chaque segment final est ajouté au champ texte
  const {
    supported: speechSupported,
    listening,
    transcribing,
    error: speechError,
    setError: setSpeechError,
    toggle: toggleDictation,
  } = useSpeechRecognition({
    lang: 'fr-FR',
    onFinalSegment: (text) => {
      onChange((valueRef.current ? valueRef.current + ' ' : '') + text)
    },
  })

  // Affichage des erreurs de dictée via l'erreur inline (même zone que les autres)
  useEffect(() => {
    if (speechError) {
      const t = setTimeout(() => setSpeechError(null), 6000)
      return () => clearTimeout(t)
    }
  }, [speechError, setSpeechError])

  // Auto-redimensionnement
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  // Focus automatique à l'ouverture
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!disabled && !generating && value.trim()) onSubmit()
    }
  }

  const canSend = value.trim().length > 0 && !disabled && !generating

  return (
    <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-6 sm:pb-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[1.5rem] border bg-card shadow-sm transition-colors focus-within:border-primary/40 focus-within:shadow-md">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              imageMode
                ? 'Décrivez l\'image à générer…'
                : transcribing
                  ? 'Transcription en cours…'
                  : listening
                    ? 'Je vous écoute… (parlez)'
                    : 'Posez votre question…'
            }
            aria-label="Message à envoyer"
            className="max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleWebSearch(!webSearch)}
                aria-pressed={webSearch}
                aria-label="Recherche sur Internet"
                title={webSearch ? 'Recherche web activée' : 'Recherche web désactivée'}
                className={cn(
                  'inline-flex h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  webSearch
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                disabled={disabled}
              >
                <Globe className="size-4" />
                <span className="hidden sm:inline">Recherche</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleImageMode(!imageMode)}
                aria-pressed={imageMode}
                aria-label="Génération d'images"
                title={imageMode ? 'Mode image activé' : 'Générer une image à partir d\'un texte'}
                className={cn(
                  'inline-flex h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  imageMode
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                disabled={disabled}
              >
                <ImageIcon className="size-4" />
                <span className="hidden sm:inline">Images</span>
              </button>
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-pressed={listening}
                  aria-label={listening ? 'Arrêter la dictée vocale' : 'Dicter un message'}
                  title={listening ? 'Arrêter la dictée' : 'Dicter un message (micro)'}
                  className={cn(
                    'inline-flex h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    listening
                      ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  disabled={disabled}
                >
                  <Mic
                    className={cn(
                      'size-4',
                      (listening || transcribing) && 'animate-pulse fill-current',
                    )}
                  />
                  <span className="hidden sm:inline">
                    {transcribing ? 'Transcription…' : listening ? 'Écoute…' : 'Dicter'}
                  </span>
                </button>
              )}
            </div>

            {generating ? (
              <Button
                type="button"
                size="icon"
                onClick={onStop}
                aria-label="Arrêter la génération"
                title="Arrêter la génération"
                className="size-11 rounded-full bg-foreground text-background hover:bg-foreground/85"
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label="Envoyer le message"
                title="Envoyer (Entrée)"
                className="size-11 rounded-full"
              >
                <ArrowUp className="size-5" />
              </Button>
            )}
          </div>
          {speechError && (
            <p role="alert" className="px-4 pb-2 text-xs text-destructive">
              {speechError}
            </p>
          )}
          {listening && !speechError && (
            <p className="px-4 pb-2 text-xs text-muted-foreground" aria-live="polite">
              {transcribing
                ? 'Transcription de votre message en cours…'
                : 'Dictée en cours — parlez naturellement, le texte apparaît dans le champ.'}
            </p>
          )}
        </div>
        <p className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
          DRAX IA peut se tromper. Vérifiez les informations importantes.
        </p>
      </div>
    </div>
  )
}
