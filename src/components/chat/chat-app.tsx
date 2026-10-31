'use client'

/**
 * DRAX IA Chat — orchestrateur principal
 * - Authentification réelle (écran d'accueil si non connecté)
 * - Conversations persistantes (créées à l'envoi du premier message)
 * - Streaming SSE avec affichage progressif, arrêt, régénération, réessai
 * - Sidebar rétractable (desktop) / tiroir (mobile), thèmes clair/sombre
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  Settings,
  Sparkles,
  Sun,
  Zap,
  BrainCircuit,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AuthView } from '@/components/chat/auth-view'
import { SidebarContent } from '@/components/chat/sidebar'
import { ChatArea } from '@/components/chat/chat-area'
import { Composer } from '@/components/chat/composer'
import { SettingsDialog } from '@/components/chat/settings-dialog'
import { InstallGuide } from '@/components/chat/install-guide'
import { authApi, conversationsApi, fluxApi, imagesApi, profileApi, streamChat } from '@/lib/api-client'
import type { AuthUser, AiInfo, AiModelChoice, ChatMessage, ConversationSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Modèle persisté pour les messages contenant une image générée. */
const IMAGE_MODEL = 'lumen-image-1'

/** Repli local si /api/auth/me n'a pas encore renvoyé la liste des modèles. */
const FALLBACK_MODELS: AiModelChoice[] = [
  { key: 'fast', displayName: 'DRAX Rapide', description: 'Réponses immédiates pour le quotidien (GLM, raisonnement désactivé).' },
  { key: 'reasoning', displayName: 'DRAX Raisonnement', description: 'Réflexion approfondie avant de répondre — maths, code, analyses (GLM, raisonnement activé).' },
]

type ModelKey = 'fast' | 'reasoning'

type BootState = 'loading' | 'anon' | 'ready'

export function ChatApp() {
  // ─── État global ────────────────────────────────────────────────────────────
  const [boot, setBoot] = useState<BootState>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [aiInfo, setAiInfo] = useState<AiInfo | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [imageMode, setImageMode] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Guide d'installation de l'app (PWA) — s'ouvre après l'authentification
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  // Modèle IA choisi dans le sélecteur (persisté côté serveur)
  const [aiModel, setAiModel] = useState<ModelKey>('fast')

  const streamRef = useRef<{ cancel: () => void } | null>(null)
  // Mémoire du dernier envoi échoué (réseau) pour permettre un réessai fidèle
  const failedSendRef = useRef<{
    placeholderId: string
    conversationId?: string
    content?: string
    clientRef?: string
    mode: 'chat' | 'image'
  } | null>(null)
  const { resolvedTheme, setTheme } = useTheme()

  // Les deux modes (recherche web / image) sont mutuellement exclusifs
  const toggleWebSearch = useCallback((v: boolean) => {
    setWebSearch(v)
    if (v) setImageMode(false)
  }, [])
  const toggleImageMode = useCallback((v: boolean) => {
    setImageMode(v)
    if (v) setWebSearch(false)
  }, [])

  // ─── Sélecteur de modèle : changement persisté côté serveur ──────────────
  const models: AiModelChoice[] = aiInfo?.models?.length ? aiInfo.models : FALLBACK_MODELS
  const selectedModel = models.find((m) => m.key === aiModel) ?? models[0]

  const handleSelectModel = useCallback(
    (key: ModelKey) => {
      if (key === aiModel) return
      const previous = aiModel
      setAiModel(key)
      profileApi
        .update({ aiModel: key })
        .then(() => toast.success(key === 'reasoning' ? 'DRAX Raisonnement activé.' : 'DRAX Rapide activé.'))
        .catch((e) => {
          // Échec de la persistance : retour au choix précédent, message clair
          setAiModel(previous)
          toast.error(e instanceof Error ? e.message : 'Préférence non enregistrée.')
        })
    },
    [aiModel],
  )

  // ─── Démarrage : session courante ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { user: u, ai } = await authApi.me()
        if (cancelled) return
        setAiInfo(ai)
        setAiModel(u?.aiModel === 'reasoning' ? 'reasoning' : 'fast')
        if (u) {
          setUser(u)
          // Guide d'installation : affiché automatiquement (une seule fois,
          // état persisté en base) — y compris après un rechargement de page
          if (!u.installGuideDismissed) {
            setInstallGuideOpen(true)
          }
          const { conversations: list } = await conversationsApi.list()
          if (!cancelled) setConversations(list)
          setBoot('ready')
        } else {
          setBoot('anon')
        }
      } catch {
        if (!cancelled) setBoot('anon')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Chargement d'une conversation ─────────────────────────────────────────
  const openConversation = useCallback(async (id: string) => {
    setMobileNavOpen(false)
    if (generating) streamRef.current?.cancel()
    try {
      const { messages: msgs } = await conversationsApi.messages(id)
      setActiveId(id)
      setMessages(msgs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible de charger la conversation.')
    }
  }, [generating])

  const startNewChat = useCallback(() => {
    if (generating) streamRef.current?.cancel()
    setActiveId(null)
    setMessages([])
    setMobileNavOpen(false)
  }, [generating])

  // ─── Envoi / streaming ─────────────────────────────────────────────────────
  const runStream = useCallback(
    async (params: { conversationId?: string; content?: string; clientRef?: string; regenerateOf?: string }) => {
      const optimisticUser = params.content
        ? ({
            id: `temp-user-${Date.now()}`,
            role: 'user',
            content: params.content,
            model: null,
            status: 'completed',
            errorType: null,
            sources: null,
            createdAt: new Date().toISOString(),
          } as ChatMessage)
        : null
      const placeholderId = `temp-assistant-${Date.now()}`
      const placeholder = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        model: aiInfo?.modelId ?? null,
        status: 'streaming',
        errorType: null,
        sources: null,
        createdAt: new Date().toISOString(),
      } as ChatMessage

      setMessages((prev) => [...prev, ...(optimisticUser ? [optimisticUser] : []), placeholder])
      setGenerating(true)
      setInput('')

      const patchPlaceholder = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === placeholderId ? { ...m, ...patch } : m)),
        )
      }

      let accumulated = ''

      const stream = streamChat(
        {
          conversationId: params.conversationId,
          content: params.content,
          clientRef: params.clientRef,
          webSearch,
          regenerateOf: params.regenerateOf,
          model: aiModel,
        },
        (event) => {
          switch (event.type) {
            case 'meta': {
              // Remplace l'id temporaire du message user par l'id réel
              if (optimisticUser) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === optimisticUser.id ? { ...m, id: event.userMessageId } : m)),
                )
              }
              // Nouvelle conversation : on l'ajoute à la liste
              setActiveId((current) => {
                if (current === event.conversationId) return current
                if (!current && !params.conversationId) {
                  setConversations((prev) => [
                    {
                      id: event.conversationId,
                      title: event.conversationTitle,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      messageCount: 1,
                      preview: params.content ?? null,
                    },
                    ...prev,
                  ])
                  return event.conversationId
                }
                return current
              })
              break
            }
            case 'sources': {
              patchPlaceholder({ sources: event.sources })
              break
            }
            case 'image_start': {
              // Demande d'image détectée en langage naturel : le placeholder
              // affiche « Génération de l'image… » jusqu'au premier delta.
              patchPlaceholder({ model: IMAGE_MODEL })
              break
            }
            case 'delta': {
              accumulated += event.text
              patchPlaceholder({ content: accumulated })
              break
            }
            case 'title': {
              setConversations((prev) =>
                prev.map((c) => (c.id === event.conversationId ? { ...c, title: event.title } : c)),
              )
              break
            }
            case 'done': {
              patchPlaceholder({
                id: event.messageId,
                status: event.status === 'cancelled' ? 'cancelled' : 'completed',
              })
              break
            }
            case 'error': {
              patchPlaceholder({
                // Le serveur a persisté le message d'erreur : on récupère son id réel
                ...(event.messageId ? { id: event.messageId } : {}),
                status: 'error',
                errorType: event.errorType,
                content: '',
              })
              toast.error(event.message)
              break
            }
          }
        },
      )

      streamRef.current = stream

      try {
        await stream.done
        // Rafraîchit l'ordre + aperçu de la liste après un échange réussi
        failedSendRef.current = null
        const { conversations: list } = await conversationsApi.list()
        setConversations(list)
      } catch (e) {
        if (streamRef.current === stream) {
          // Annulation volontaire → le serveur conserve la partie déjà générée
          const aborted = e instanceof DOMException && e.name === 'AbortError'
          if (aborted) {
            patchPlaceholder({ status: 'cancelled' })
          } else {
            const status = (e as { status?: number }).status ?? 0
            patchPlaceholder({
              status: 'error',
              errorType: status === 0 || status >= 500 ? 'network' : 'unknown',
              content: '',
            })
            // Échec d'envoi pur : le serveur n'a rien persisté → mémorise pour le réessai
            if (status === 0 || status >= 500) {
              failedSendRef.current = {
                placeholderId,
                conversationId: params.conversationId,
                content: params.content,
                clientRef: params.clientRef,
                mode: 'chat',
              }
            }
            toast.error(e instanceof Error ? e.message : 'Échec de la génération.')
          }
        }
      } finally {
        setGenerating(false)
        streamRef.current = null
      }
    },
    [aiInfo, webSearch, aiModel],
  )

  /**
   * Génération d'image (mode « Images » du composeur).
   * Mêmes garanties que le chat : message utilisateur dédupliqué (clientRef),
   * réessai après échec réseau, régénération de la dernière image.
   */
  const runImageGeneration = useCallback(
    async (params: { conversationId?: string; prompt: string; clientRef: string; regenerateOf?: string }) => {
      const tempUserId = `temp-user-${Date.now()}`
      const placeholderId = `temp-assistant-${Date.now() + 1}`
      const optimisticUser: ChatMessage = {
        id: tempUserId,
        role: 'user',
        content: params.prompt,
        model: null,
        status: 'completed',
        errorType: null,
        sources: null,
        createdAt: new Date().toISOString(),
      }
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        model: IMAGE_MODEL,
        status: 'streaming',
        errorType: null,
        sources: null,
        createdAt: new Date().toISOString(),
      }

      // En régénération, le message utilisateur réel est déjà dans la liste
      setMessages((prev) => [
        ...prev,
        ...(params.regenerateOf ? [] : [optimisticUser]),
        placeholder,
      ])
      setGenerating(true)
      setInput('')

      const patchPlaceholder = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === placeholderId ? { ...m, ...patch } : m)),
        )
      }

      try {
        const res = await imagesApi.generate({
          conversationId: params.conversationId,
          prompt: params.prompt,
          clientRef: params.clientRef,
          regenerateOf: params.regenerateOf,
        })
        // Remplace les messages temporaires par les messages persistés réels
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === tempUserId && !params.regenerateOf) return res.userMessage
            if (m.id === placeholderId) return res.assistantMessage
            return m
          }),
        )
        setActiveId(res.conversation.id)
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === res.conversation.id)
          if (exists) {
            return prev.map((c) =>
              c.id === res.conversation.id
                ? { ...c, title: res.conversation.title, updatedAt: new Date().toISOString() }
                : c,
            )
          }
          return [
            {
              id: res.conversation.id,
              title: res.conversation.title,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageCount: 2,
              preview: params.prompt,
            },
            ...prev,
          ]
        })
        failedSendRef.current = null
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0
        const errorType = (e as { errorType?: string }).errorType
        if (status === 0 || status >= 500) {
          // Échec réseau/serveur : le message utilisateur peut déjà exister,
          // le réessai re-soumet la même description (dédoublonnage clientRef).
          patchPlaceholder({ status: 'error', errorType: status === 0 ? 'network' : (errorType ?? 'unknown'), content: '' })
          failedSendRef.current = {
            placeholderId,
            conversationId: params.conversationId,
            content: params.prompt,
            clientRef: params.clientRef,
            mode: 'image',
          }
        } else {
          // 4xx (validation, quota…) : erreur transitoire, l'utilisateur corrige
          patchPlaceholder({ status: 'error', errorType: errorType ?? 'unknown', content: '' })
        }
        toast.error(e instanceof Error ? e.message : "La génération d'image a échoué.")
      } finally {
        setGenerating(false)
      }
    },
    [],
  )

  const handleSend = useCallback(() => {
    const content = input.trim()
    if (!content || generating) return
    const clientRef = crypto.randomUUID()
    if (imageMode) {
      runImageGeneration({ conversationId: activeId ?? undefined, prompt: content, clientRef })
    } else {
      runStream({ conversationId: activeId ?? undefined, content, clientRef })
    }
  }, [input, generating, activeId, imageMode, runStream, runImageGeneration])

  const handleStop = useCallback(() => {
    streamRef.current?.cancel()
  }, [])

  const handleRegenerate = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && (m.status === 'completed' || m.status === 'cancelled'))
    if (!last || last.id.startsWith('temp-')) return
    setMessages((prev) => prev.filter((m) => m.id !== last.id))
    if (last.model === IMAGE_MODEL) {
      // Image générée → régénération via le générateur d'images
      runImageGeneration({
        conversationId: activeId ?? undefined,
        prompt: '',
        clientRef: crypto.randomUUID(),
        regenerateOf: last.id,
      })
    } else {
      runStream({ conversationId: activeId ?? undefined, regenerateOf: last.id })
    }
  }, [messages, activeId, runStream, runImageGeneration])

  const handleRetryError = useCallback(
    (messageId: string) => {
      const failed = failedSendRef.current
      if (failed && failed.placeholderId === messageId) {
        // Échec d'envoi pur : re-soumission du contenu original (dédoublonnage
        // côté serveur via clientRef si le message avait déjà été créé).
        failedSendRef.current = null
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        if (failed.mode === 'image') {
          runImageGeneration({
            conversationId: failed.conversationId,
            prompt: failed.content ?? '',
            clientRef: failed.clientRef ?? crypto.randomUUID(),
          })
        } else {
          runStream({
            conversationId: failed.conversationId,
            content: failed.content,
            clientRef: failed.clientRef,
          })
        }
        return
      }
      // Erreur persistée côté serveur : régénération à partir de ce message
      if (!messageId.startsWith('temp-')) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        runStream({ conversationId: activeId ?? undefined, regenerateOf: messageId })
      } else {
        toast.error('Impossible de réessayer automatiquement. Rechargez la page.')
      }
    },
    [activeId, runStream, runImageGeneration],
  )

  // ─── Gestion sidebar : renommage / suppression ─────────────────────────────
  const handleRenamed = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    toast.success('Conversation renommée.')
  }, [])

  const handleDeleted = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
      toast.success('Conversation supprimée.')
    },
    [activeId],
  )

  const handleAuthenticated = useCallback(async (u: AuthUser) => {
    setUser(u)
    setAiModel(u?.aiModel === 'reasoning' ? 'reasoning' : 'fast')
    // Guide d'installation : affiché automatiquement tant que l'utilisateur
    // ne l'a pas fermé (état persisté en base → une seule fois)
    if (!u.installGuideDismissed) {
      setInstallGuideOpen(true)
    }
    try {
      const [{ conversations: list }, me] = await Promise.all([conversationsApi.list(), authApi.me()])
      setConversations(list)
      setAiInfo(me.ai)
    } catch {
      setConversations([])
    }
    setBoot('ready')
  }, [])

  const handleSignedOut = useCallback(() => {
    streamRef.current?.cancel()
    setUser(null)
    setConversations([])
    setActiveId(null)
    setMessages([])
    setSettingsOpen(false)
    setInstallGuideOpen(false)
    setBoot('anon')
  }, [])

  /** Fermeture du guide d'installation → persisté en base (plus d'auto-affichage). */
  const handleInstallGuideDismissed = useCallback(() => {
    setInstallGuideOpen(false)
    setUser((prev) => (prev ? { ...prev, installGuideDismissed: true } : prev))
    profileApi
      .update({ installGuideDismissed: true })
      .catch(() => toast.error('Préférence non enregistrée (le guide pourrait se réafficher).'))
  }, [])

  // ─── Écrans de chargement / authentification ───────────────────────────────
  if (boot === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" role="status" aria-label="Chargement">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (boot === 'anon' || !user) {
    return (
      <>
        <AuthView onAuthenticated={handleAuthenticated} onErrorToast={(m) => toast.error(m)} />
      </>
    )
  }

  const activeConversation = conversations.find((c) => c.id === activeId)

  return (
    <div className="flex h-dvh overflow-hidden bg-background" data-testid="chat-app">
      {/* Sidebar ordinateur */}
      <aside
        className={cn(
          'relative hidden shrink-0 border-r transition-[width] duration-200 md:block',
          desktopNavCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-72',
        )}
        aria-label="Barre latérale"
      >
        <SidebarContent
          conversations={conversations}
          activeId={activeId}
          onSelect={openConversation}
          onNew={startNewChat}
          onRenamed={handleRenamed}
          onDeleted={handleDeleted}
          onError={(m) => toast.error(m)}
        />
        <SidebarFooter onOpenSettings={() => setSettingsOpen(true)} user={user} />
      </aside>

      {/* Tiroir mobile */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[86%] max-w-80 border-r bg-sidebar p-0 sm:max-w-80 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Historique des conversations</SheetTitle>
          </SheetHeader>
          <div className="relative h-full">
            <SidebarContent
              conversations={conversations}
              activeId={activeId}
              onSelect={openConversation}
              onNew={startNewChat}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
              onError={(m) => toast.error(m)}
            />
            <SidebarFooter onOpenSettings={() => setSettingsOpen(true)} user={user} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Colonne principale */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* En-tête */}
        <header className="flex h-13 shrink-0 items-center gap-1.5 border-b bg-background/80 px-2 backdrop-blur sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Ouvrir le menu des conversations"
          >
            <PanelLeft className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setDesktopNavCollapsed((v) => !v)}
            aria-label={desktopNavCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale'}
            title={desktopNavCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale'}
          >
            <PanelLeft className={cn('size-5 transition-transform', desktopNavCollapsed && 'rotate-180')} />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2" data-testid="header-title">
            {/* Sélecteur de modèle : les 2 IA réellement disponibles, choix persisté */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 rounded-lg px-2 text-[13px] font-semibold"
                  aria-label="Choisir le modèle IA"
                  data-testid="model-selector"
                >
                  {selectedModel?.key === 'reasoning' ? (
                    <BrainCircuit className="size-4 text-primary" />
                  ) : (
                    <Zap className="size-4 text-primary" />
                  )}
                  <span className="max-w-[9rem] truncate sm:max-w-none">{selectedModel?.displayName ?? 'Modèle'}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-80">
                {models.map((m) => (
                  <DropdownMenuItem
                    key={m.key}
                    onClick={() => handleSelectModel(m.key)}
                    className="items-start gap-2 py-2.5"
                    data-testid={`model-option-${m.key}`}
                  >
                    {m.key === 'reasoning' ? (
                      <BrainCircuit className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <Zap className="mt-0.5 size-4 shrink-0 text-primary" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {m.displayName}
                        {m.key === aiModel && <Check className="size-3.5 text-primary" aria-label="Modèle actif" />}
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">{m.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Sparkles className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden="true" />
            <h1 className="hidden truncate text-sm font-semibold sm:block">
              {activeConversation?.title ?? 'Nouvelle conversation'}
            </h1>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={startNewChat}
            aria-label="Nouvelle conversation"
          >
            <MessageSquarePlus className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            title="Changer de thème"
          >
            {resolvedTheme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Menu du compte">
                <Settings className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="mr-2 size-4" /> Paramètres
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleWebSearch(!webSearch)}>
                <Sparkles className="mr-2 size-4" />
                Recherche web : {webSearch ? 'activée' : 'désactivée'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleImageMode(!imageMode)}>
                <ImageIcon className="mr-2 size-4" />
                Images : {imageMode ? 'activé' : 'désactivé'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Bandeau d'état IA indisponible */}
        {aiInfo && !aiInfo.available && (
          <div role="alert" className="border-b bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
            Modèle IA non configuré côté serveur ({aiInfo.unavailableReason}). L&apos;envoi de messages est désactivé.
          </div>
        )}

        <ChatArea
          key={activeId ?? 'new'}
          messages={messages}
          generating={generating}
          userName={user.displayName}
          onRegenerate={handleRegenerate}
          onRetryError={handleRetryError}
          onSuggestion={(text) => setInput(text)}
        />

        <Composer
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onStop={handleStop}
          generating={generating}
          webSearch={webSearch}
          onToggleWebSearch={toggleWebSearch}
          imageMode={imageMode}
          onToggleImageMode={toggleImageMode}
          disabled={!!aiInfo && !aiInfo.available}
        />
      </main>

      {/* Paramètres */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        onUserUpdated={setUser}
        onSignedOut={handleSignedOut}
        onErrorToast={(m) => toast.error(m)}
        onSuccessToast={(m) => toast.success(m)}
        onOpenInstallGuide={() => {
          setSettingsOpen(false)
          setInstallGuideOpen(true)
        }}
      />

      {/* Guide d'installation de l'application (PWA) */}
      <InstallGuide
        open={installGuideOpen}
        onOpenChange={setInstallGuideOpen}
        onDismiss={handleInstallGuideDismissed}
      />
    </div>
  )
}

/** Pied de sidebar : carte utilisateur + accès paramètres */
function SidebarFooter({ user, onOpenSettings }: { user: AuthUser; onOpenSettings: () => void }) {
  return (
    <div className="absolute right-0 bottom-0 left-0 border-t bg-sidebar p-2.5">
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Ouvrir les paramètres du compte"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary uppercase"
          aria-hidden="true"
        >
          {user.displayName.trim().charAt(0) || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <Settings className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}
