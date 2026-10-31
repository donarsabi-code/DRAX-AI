'use client'

/**
 * Barre latérale — DRAX IA Chat
 * - Nouvelle conversation, historique groupé par date
 * - Recherche serveur dans titres + messages (extraits de contexte)
 * - Renommage (dialogue) et suppression (confirmation)
 * - Repliable sur ordinateur, tiroir plein écran sur mobile
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ConversationSummary, SearchResult } from '@/lib/types'
import { searchApi, conversationsApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface SidebarContentProps {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRenamed: (id: string, title: string) => void
  onDeleted: (id: string) => void
  onError: (message: string) => void
}

function groupConversations(convs: ConversationSummary[]) {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: 'Hier', items: [] },
    { label: '7 derniers jours', items: [] },
    { label: '30 derniers jours', items: [] },
    { label: 'Plus ancien', items: [] },
  ]
  for (const c of convs) {
    const t = new Date(c.updatedAt).getTime()
    if (t >= startOfToday) groups[0].items.push(c)
    else if (t >= startOfToday - dayMs) groups[1].items.push(c)
    else if (t >= startOfToday - 7 * dayMs) groups[2].items.push(c)
    else if (t >= startOfToday - 30 * dayMs) groups[3].items.push(c)
    else groups[4].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function SidebarContent({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRenamed,
  onDeleted,
  onError,
}: SidebarContentProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [renameTarget, setRenameTarget] = useState<ConversationSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Recherche serveur débouncée (>= 2 caractères)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await searchApi.query(q)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const groups = useMemo(() => groupConversations(conversations), [conversations])

  const confirmRename = async () => {
    if (!renameTarget) return
    const title = renameValue.trim()
    if (!title) return
    try {
      await conversationsApi.rename(renameTarget.id, title)
      onRenamed(renameTarget.id, title)
      setRenameTarget(null)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Échec du renommage.')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await conversationsApi.remove(deleteTarget.id)
      onDeleted(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Échec de la suppression.')
    }
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <Button
          type="button"
          onClick={onNew}
          variant="default"
          className="h-10 flex-1 justify-start gap-2 rounded-xl px-3 text-sm font-medium shadow-sm"
        >
          <MessageSquarePlus className="size-4" />
          Nouvelle conversation
        </Button>
        {/* Logo officiel DRAX IA */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/drax-192.png"
          alt="DRAX IA"
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-[22%] shadow-sm"
        />
      </div>

      {/* Recherche */}
      <div className="px-3 pb-1 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher dans les conversations"
            className="h-9 rounded-xl border-transparent bg-muted pl-9 text-sm focus-visible:bg-background"
          />
          {searching && (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {query && !searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full hover:bg-background"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <nav aria-label="Historique des conversations" className="flex-1 overflow-y-auto px-2 pt-2 pb-20">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucun résultat pour « {query.trim()} ».
            </p>
          ) : (
            <ul className="space-y-0.5">
              {searchResults.map((r) => (
                <li key={r.conversationId}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.conversationId)}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-sidebar-accent',
                      activeId === r.conversationId && 'bg-sidebar-accent',
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    {r.snippet && (
                      <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                        {r.snippet}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : conversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">Aucune conversation</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Lancez votre premier échange pour voir l&apos;historique ici.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((c) => (
                  <li key={c.id} className="group/item relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className={cn(
                        'w-full rounded-xl px-3 py-2 pr-9 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        activeId === c.id && 'bg-sidebar-accent',
                      )}
                      aria-current={activeId === c.id ? 'true' : undefined}
                    >
                      <span className="block truncate text-sm">{c.title}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Options de « ${c.title} »`}
                      onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                      className={cn(
                        'absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-opacity hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        openMenuId === c.id
                          ? 'opacity-100'
                          : 'opacity-0 group-hover/item:opacity-100 max-md:opacity-100',
                      )}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {openMenuId === c.id && (
                      <div
                        role="menu"
                        className="absolute top-full right-1.5 z-30 mt-1 w-44 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRenameTarget(c)
                            setRenameValue(c.title)
                            setOpenMenuId(null)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                        >
                          <Pencil className="size-4" /> Renommer
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setDeleteTarget(c)
                            setOpenMenuId(null)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="size-4" /> Supprimer
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* Renommage */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Renommer la conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
            maxLength={120}
            autoFocus
            aria-label="Nouveau titre"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Annuler
            </Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>
              <Check className="mr-1 size-4" /> Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette conversation ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.title} » et tous ses messages seront définitivement supprimés. Cette
              action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
