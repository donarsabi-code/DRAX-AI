'use client'

/**
 * Saisie vocale hybride — DRAX IA Chat
 *
 * Deux modes, choisis automatiquement selon le navigateur :
 *  1. « live » — Web Speech API (standard du navigateur) : transcription
 *     instantanée pendant qu'on parle. Disponible sur Chrome/Edge desktop,
 *     Chrome Android. C'est le mode le plus fluide.
 *  2. « record » — enregistrement micro (MediaRecorder) envoyé à la route
 *     serveur /api/asr qui renvoie le texte. C'est le mode utilisé sur
 *     Safari iOS (iPhone/iPad) et Firefox où la Web Speech API est absente
 *     ou instable. Aucun audio n'est stocké : transcrit puis jeté.
 *
 * Dans les deux cas : demande d'autorisation micro explicite, le texte
 * transcrit est ajouté au champ de saisie via onFinalSegment.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// Types Web Speech API (absents des lib DOM par défaut pour certaines versions)
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Safari iOS : MediaRecorder existe mais ne supporte que audio/mp4. */
function pickRecorderMime(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      // isTypeSupported peut manquer sur d'anciens navigateurs
    }
  }
  return null
}

function mimeToEnum(mime: string): 'audio/mp4' | 'audio/webm' | 'audio/ogg' {
  if (mime.startsWith('audio/mp4')) return 'audio/mp4'
  if (mime.startsWith('audio/ogg')) return 'audio/ogg'
  return 'audio/webm'
}

interface UseSpeechRecognitionOptions {
  lang?: string
  /** Appelé avec chaque segment FINAL de transcription (ou le texte complet en mode record). */
  onFinalSegment: (text: string) => void
}

export function useSpeechRecognition({ lang = 'fr-FR', onFinalSegment }: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const finalRef = useRef(onFinalSegment)

  // Synchronise le callback hors du rendu (règle react-hooks/refs)
  useEffect(() => {
    finalRef.current = onFinalSegment
  }, [onFinalSegment])

  const liveCtor = typeof window !== 'undefined' ? getRecognitionCtor() : null
  const recordMime = typeof window !== 'undefined' ? pickRecorderMime() : null
  // Safari iOS : la Web Speech API existe mais échoue souvent au démarrage →
  // on lui préfère systématiquement l'enregistrement + transcription serveur.
  const isIos =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const mode: 'live' | 'record' | null = liveCtor && !isIos ? 'live' : recordMime ? 'record' : null
  const supported = mode !== null

  const stopLive = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const stopRecord = useCallback(() => {
    try {
      recorderRef.current?.stop()
    } catch {
      // déjà arrêté
    }
  }, [])

  const stop = useCallback(() => {
    if (mode === 'live') stopLive()
    else stopRecord()
  }, [mode, stopLive, stopRecord])

  // ── Mode « record » : MediaRecorder → /api/asr ───────────────────────────────
  const startRecord = useCallback(async () => {
    if (!recordMime) {
      setError("L'enregistrement vocal n'est pas pris en charge par ce navigateur.")
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: recordMime })
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        // Libère le micro immédiatement (l'indicateur orange d'iOS disparaît)
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setListening(false)

        const blob = new Blob(chunksRef.current, { type: recordMime })
        chunksRef.current = []
        if (blob.size < 2048) {
          setError('Aucune voix détectée. Maintenez la dictée un peu plus longtemps.')
          return
        }
        setTranscribing(true)
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = String(reader.result ?? '')
              const commaIndex = dataUrl.indexOf(',')
              resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : '')
            }
            reader.onerror = () => reject(new Error('lecture audio'))
            reader.readAsDataURL(blob)
          })
          const res = await fetch('/api/asr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mime: mimeToEnum(recordMime) }),
          })
          const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
          if (!res.ok) {
            setError(data?.error ?? 'La transcription a échoué. Réessayez.')
            return
          }
          const text = (data?.text ?? '').trim()
          if (text) finalRef.current(text)
          else setError('Aucune parole détectée. Rapprochez-vous du micro et réessayez.')
        } catch {
          setError('Connexion impossible pendant la transcription. Réessayez.')
        } finally {
          setTranscribing(false)
        }
      }
      recorderRef.current = recorder
      recorder.start(1000) // segmente toutes les secondes (fiabilité iOS)
      setListening(true)
    } catch (err) {
      const name = (err as { name?: string }).name
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Accès au micro refusé. Autorisez le microphone pour ce site dans les réglages.')
      } else if (name === 'NotFoundError') {
        setError('Aucun micro détecté sur cet appareil.')
      } else {
        setError('Impossible de démarrer l\'enregistrement. Réessayez.')
      }
    }
  }, [recordMime])

  // ── Mode « live » : Web Speech API ───────────────────────────────────────────
  const startLive = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError("La dictée vocale n'est pas prise en charge par ce navigateur.")
      return
    }
    setError(null)

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      // Concatène tous les segments FINaux de ce lot d'événements
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal && result[0]) {
          finalText += result[0].transcript
        }
      }
      if (finalText.trim()) finalRef.current(finalText.trim())
    }

    recognition.onerror = (event) => {
      const kind = event.error
      if (kind === 'not-allowed' || kind === 'service-not-allowed') {
        setError('Accès au micro refusé. Autorisez le microphone dans les réglages du navigateur.')
      } else if (kind === 'no-speech') {
        setError('Aucune voix détectée. Réessayez.')
      } else if (kind !== 'aborted') {
        setError('Erreur de reconnaissance vocale. Réessayez.')
      }
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Impossible de démarrer la dictée. Réessayez.')
      setListening(false)
    }
  }, [lang])

  const start = useCallback(() => {
    if (mode === 'record') {
      void startRecord()
    } else {
      startLive()
    }
  }, [mode, startRecord, startLive])

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      try {
        recorderRef.current?.stop()
      } catch {
        // déjà arrêté
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const toggle = useCallback(() => {
    if (listening || transcribing) stop()
    else start()
  }, [listening, transcribing, stop, start])

  return { supported, listening, transcribing, error, setError, start, stop, toggle }
}
