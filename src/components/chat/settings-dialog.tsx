'use client'

/**
 * Dashboard utilisateur — DRAX IA
 *
 * 8 onglets complets, toutes les données persistées en base :
 *  1. Profil       : avatar (upload + redimensionnement auto), nom, bio, e-mail
 *  2. Apparence    : thème clair / sombre / système
 *  3. Intelligence : modèle IA par défaut (DRAX Rapide / DRAX Raisonnement)
 *  4. Statistiques : messages, conversations, images, recherches, série
 *                    d'activité, courbe des 30 derniers jours (BDD réelle)
 *  5. Sécurité     : mot de passe, sessions actives, déconnexion des autres
 *                    appareils
 *  6. Données      : export JSON complet (portabilité), journal d'activité
 *  7. Application  : guide d'installation PWA, état installé, infos compte
 *  8. Serveur      : propriétaire uniquement — connexion Google OAuth,
 *                    SMTP e-mail réel (Gmail + code), e-mail de test réel
 *
 * Zone de danger : déconnexion, suppression définitive du compte.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Flame,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  MessagesSquare,
  Monitor,
  Moon,
  Search,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Sun,
  SunMoon,
  Trash2,
  UserRound,
  Wrench,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from '@/components/ui/separator'
import { useTheme } from 'next-themes'
import { authApi, fluxApi, profileApi, serverConfigApi, ApiError } from '@/lib/api-client'
import type { ServerConfigStatus } from '@/lib/api-client'
import type { ApiEventEntry, AuthUser, SessionInfo, UsageStats } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser
  onUserUpdated: (user: AuthUser) => void
  onSignedOut: () => void
  onErrorToast: (m: string) => void
  onSuccessToast: (m: string) => void
  /** Ouvre le guide d'installation PWA (onglet Application) */
  onOpenInstallGuide: () => void
}

/** Redimensionne une image sélectionnée en carré 256×256 PNG (canvas). */
async function fileToAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  // Recadrage centré couvrant
  const min = Math.min(bitmap.width, bitmap.height)
  ctx.drawImage(
    bitmap,
    (bitmap.width - min) / 2,
    (bitmap.height - min) / 2,
    min,
    min,
    0,
    0,
    size,
    size,
  )
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))),
      'image/png',
    ),
  )
}

/** Avatar affiché : upload interne ou initiale. */
function AvatarBubble({ user, size = 72 }: { user: AuthUser; size?: number }) {
  const isInternal = !!user.avatarUrl && user.avatarUrl.startsWith('/api/')
  const [cacheBust, setCacheBust] = useState(Date.now())
  useEffect(() => {
    setCacheBust(Date.now())
  }, [user.avatarUrl])
  if (isInternal) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${user.avatarUrl}?v=${cacheBust}`}
        alt="Votre avatar"
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-primary/30"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-primary/15 font-bold text-primary uppercase ring-2 ring-primary/20"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {user.displayName.trim().charAt(0) || '?'}
    </span>
  )
}

/** Petite carte de statistique. */
function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-2xl border bg-card/70 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** Mini-courbe en barres des 30 derniers jours (CSS pur). */
function DailyBars({ daily }: { daily: { day: string; count: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.count))
  return (
    <div className="rounded-2xl border bg-card/70 p-3.5">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-primary" /> Messages envoyés — 30 derniers jours
        </span>
        <span className="tabular-nums">max {max}</span>
      </div>
      <div className="flex h-16 items-end gap-[3px]" role="img" aria-label="Courbe des messages des 30 derniers jours">
        {daily.map((d, i) => (
          <div
            key={d.day}
            className="flex-1 rounded-t-sm bg-primary/75 transition-all hover:bg-primary"
            style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
            title={`${d.day} : ${d.count} message(s)`}
          />
        ))}
      </div>
    </div>
  )
}

export function SettingsDialog({
  open,
  onOpenChange,
  user,
  onUserUpdated,
  onSignedOut,
  onErrorToast,
  onSuccessToast,
  onOpenInstallGuide,
}: SettingsDialogProps) {
  const { theme, setTheme } = useTheme()

  // ─── Profil ────────────────────────────────────────────────────────────────
  const [name, setName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const profileDirty = name.trim() !== user.displayName || (user.bio ?? '') !== bio

  // ─── IA ─────────────────────────────────────────────────────────────────────
  const [aiModel, setAiModel] = useState<'fast' | 'reasoning'>(
    user.aiModel === 'reasoning' ? 'reasoning' : 'fast',
  )

  // ─── Statistiques ──────────────────────────────────────────────────────────
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // ─── Sécurité ──────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [revoking, setRevoking] = useState(false)

  // ─── Données ───────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ApiEventEntry[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  // ─── Danger ────────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // ─── Application ───────────────────────────────────────────────────────────
  const [isStandalone, setIsStandalone] = useState(false)

  // Resynchronise les champs quand le dialog s'ouvre (ou que user change)
  useEffect(() => {
    if (open) {
      setName(user.displayName)
      setBio(user.bio ?? '')
      setAiModel(user.aiModel === 'reasoning' ? 'reasoning' : 'fast')
      setIsStandalone(
        typeof window !== 'undefined' &&
          (window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as unknown as { standalone?: boolean }).standalone === true),
      )
    }
  }, [open, user])

  // Chargements paresseux à l'ouverture de chaque onglet
  const loadStats = useCallback(async () => {
    if (stats || statsLoading) return
    setStatsLoading(true)
    try {
      const { stats: s } = await profileApi.stats()
      setStats(s)
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Statistiques indisponibles.')
    } finally {
      setStatsLoading(false)
    }
  }, [stats, statsLoading, onErrorToast])

  const loadSessions = useCallback(async () => {
    try {
      const { sessions: s } = await profileApi.sessions()
      setSessions(s)
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Sessions indisponibles.')
    }
  }, [onErrorToast])

  const loadEvents = useCallback(async () => {
    if (events || eventsLoading) return
    setEventsLoading(true)
    try {
      const { events: evs } = await fluxApi.events()
      setEvents(evs.slice(0, 20))
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Journal indisponible.')
    } finally {
      setEventsLoading(false)
    }
  }, [events, eventsLoading, onErrorToast])

  const handleTabChange = (tab: string) => {
    if (tab === 'stats') loadStats()
    if (tab === 'security') loadSessions()
    if (tab === 'data') loadEvents()
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!name.trim()) return
    setSavingProfile(true)
    try {
      const { user: updated } = await profileApi.update({
        displayName: name.trim(),
        bio: bio.trim() || null,
      })
      onUserUpdated(updated)
      onSuccessToast('Profil mis à jour.')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la mise à jour.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onErrorToast('Choisissez une image (PNG, JPEG ou WebP).')
      return
    }
    setUploadingAvatar(true)
    try {
      const blob = await fileToAvatarBlob(file)
      const { user: updated } = await profileApi.uploadAvatar(blob)
      onUserUpdated(updated)
      onSuccessToast('Avatar mis à jour.')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de l\'envoi de l\'avatar.')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const removeAvatar = async () => {
    try {
      const { user: updated } = await profileApi.removeAvatar()
      onUserUpdated(updated)
      onSuccessToast('Avatar retiré.')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la suppression.')
    }
  }

  const changePassword = async () => {
    if (!currentPassword || newPassword.length < 8) {
      onErrorToast('Le nouveau mot de passe doit contenir au moins 8 caractères.')
      return
    }
    setSavingPassword(true)
    try {
      const res = await profileApi.changePassword(currentPassword, newPassword)
      onSuccessToast(res.message)
      setCurrentPassword('')
      setNewPassword('')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec du changement de mot de passe.')
    } finally {
      setSavingPassword(false)
    }
  }

  const selectAiModel = async (key: 'fast' | 'reasoning') => {
    if (key === aiModel) return
    const previous = aiModel
    setAiModel(key)
    try {
      const { user: updated } = await profileApi.update({ aiModel: key })
      onUserUpdated(updated)
      onSuccessToast(key === 'reasoning' ? 'DRAX Raisonnement activé par défaut.' : 'DRAX Rapide activé par défaut.')
    } catch (e) {
      setAiModel(previous)
      onErrorToast(e instanceof ApiError ? e.message : 'Préférence non enregistrée.')
    }
  }

  const revokeSessions = async () => {
    setRevoking(true)
    try {
      const res = await profileApi.revokeOtherSessions()
      onSuccessToast(res.revoked > 0 ? `${res.revoked} session(s) déconnectée(s).` : 'Aucune autre session ouverte.')
      await loadSessions()
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la déconnexion des autres sessions.')
    } finally {
      setRevoking(false)
    }
  }

  const signOut = async () => {
    try {
      await authApi.logout()
    } finally {
      onSignedOut()
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await profileApi.deleteAccount(deletePassword)
      onSignedOut()
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la suppression du compte.')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  const themeOptions = [
    { value: 'light', label: 'Clair', icon: Sun },
    { value: 'dark', label: 'Sombre', icon: Moon },
    { value: 'system', label: 'Système', icon: SunMoon },
  ]

  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88dvh] overflow-hidden rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" /> Dashboard — {user.displayName}
            </DialogTitle>
            <DialogDescription>
              Connecté en tant que {user.email}
              {memberSince ? ` · membre depuis le ${memberSince}` : ''}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="profil" onValueChange={handleTabChange} className="flex max-h-[64dvh] flex-col gap-3 overflow-hidden">
            <TabsList className="grid w-full shrink-0 grid-cols-8 gap-0.5 overflow-x-auto">
              <TabsTrigger value="profil" aria-label="Profil" className="px-1.5">
                <UserRound className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Profil</span>
              </TabsTrigger>
              <TabsTrigger value="apparence" aria-label="Apparence" className="px-1.5">
                <SunMoon className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Thème</span>
              </TabsTrigger>
              <TabsTrigger value="ia" aria-label="Intelligence" className="px-1.5">
                <BrainCircuit className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">IA</span>
              </TabsTrigger>
              <TabsTrigger value="stats" aria-label="Statistiques" className="px-1.5">
                <BarChart3 className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Stats</span>
              </TabsTrigger>
              <TabsTrigger value="security" aria-label="Sécurité" className="px-1.5">
                <ShieldCheck className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Sécurité</span>
              </TabsTrigger>
              <TabsTrigger value="data" aria-label="Données" className="px-1.5">
                <Database className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Données</span>
              </TabsTrigger>
              <TabsTrigger value="app" aria-label="Application" className="px-1.5">
                <Smartphone className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">App</span>
              </TabsTrigger>
              <TabsTrigger value="serveur" aria-label="Serveur" className="px-1.5">
                <Server className="size-4" />
                <span className="sr-only sm:not-sr-only sm:text-[11px]">Serveur</span>
              </TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {/* ─── Profil ─────────────────────────────────────────────── */}
              <TabsContent value="profil" className="mt-0 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <AvatarBubble user={user} />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 disabled:opacity-60"
                      aria-label="Changer l'avatar"
                    >
                      {uploadingAvatar ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleAvatarPick(e.target.files?.[0])}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{user.displayName}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    {user.avatarUrl && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={removeAvatar}>
                        Retirer l&apos;avatar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dash-name">Nom affiché</Label>
                  <Input id="dash-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dash-bio">
                    Bio <span className="text-xs text-muted-foreground">({bio.length}/280)</span>
                  </Label>
                  <Textarea
                    id="dash-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 280))}
                    placeholder="Quelques mots sur vous (optionnel)…"
                    rows={3}
                  />
                </div>
                <Button onClick={saveProfile} disabled={savingProfile || !name.trim() || !profileDirty} className="w-full">
                  {savingProfile && <Loader2 className="mr-1 size-4 animate-spin" />}
                  Enregistrer le profil
                </Button>
              </TabsContent>

              {/* ─── Apparence ──────────────────────────────────────────── */}
              <TabsContent value="apparence" className="mt-0 space-y-3">
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Thème">
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={theme === value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-4 text-xs font-medium transition-colors hover:bg-muted',
                        theme === value && 'border-primary bg-primary/5 text-primary',
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                      {theme === value && <Check className="size-3" />}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Le choix est appliqué instantanément et mémorisé sur cet appareil.
                </p>
              </TabsContent>

              {/* ─── IA ───────────────────────────────────────────────────── */}
              <TabsContent value="ia" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Modèle utilisé par défaut pour vos nouvelles conversations. Le sélecteur en haut
                  du chat change aussi cette préférence (persistée en base).
                </p>
                <div className="space-y-2" role="radiogroup" aria-label="Modèle IA par défaut">
                  {(
                    [
                      {
                        key: 'fast' as const,
                        title: 'DRAX Rapide',
                        desc: 'Réponses immédiates pour le quotidien (GLM, raisonnement désactivé).',
                        icon: Zap,
                      },
                      {
                        key: 'reasoning' as const,
                        title: 'DRAX Raisonnement',
                        desc: 'Réflexion approfondie avant de répondre — maths, code, analyses (GLM, raisonnement activé).',
                        icon: BrainCircuit,
                      },
                    ]
                  ).map(({ key, title, desc, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={aiModel === key}
                      onClick={() => selectAiModel(key)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors hover:bg-muted/60',
                        aiModel === key && 'border-primary bg-primary/5',
                      )}
                    >
                      <Icon className={cn('mt-0.5 size-5 shrink-0', aiModel === key ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          {title}
                          {aiModel === key && <Check className="size-3.5 text-primary" aria-label="Actif" />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* ─── Statistiques ───────────────────────────────────────── */}
              <TabsContent value="stats" className="mt-0 space-y-3">
                {statsLoading && !stats && (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Calcul de vos statistiques…
                  </div>
                )}
                {stats && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <StatCard icon={MessagesSquare} label="Conversations" value={stats.conversations} />
                      <StatCard icon={MessageSquare} label="Messages" value={stats.messagesTotal} hint={`${stats.messages30d} sur 30 jours`} />
                      <StatCard icon={ImageIcon} label="Images créées" value={stats.imagesGenerated} />
                      <StatCard icon={Search} label="Recherches web" value={stats.webSearches} />
                      <StatCard icon={Flame} label="Série active" value={`${stats.streak} j`} hint={`${stats.activeDays} jours actifs`} />
                      <StatCard icon={Activity} label="Moyenne / jour" value={stats.avgPerDay} />
                    </div>
                    <DailyBars daily={stats.daily} />
                    <p className="text-[11px] text-muted-foreground">
                      Ces chiffres proviennent de votre base de données personnelle (messages,
                      conversations et journal d&apos;activité) — rien d&apos;estimé.
                    </p>
                  </>
                )}
              </TabsContent>

              {/* ─── Sécurité ───────────────────────────────────────────── */}
              <TabsContent value="security" className="mt-0 space-y-4">
                <section aria-label="Sessions actives" className="space-y-2">
                  <h3 className="text-sm font-semibold">Sessions actives</h3>
                  {!sessions && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Chargement…
                    </div>
                  )}
                  {sessions && (
                    <ul className="space-y-1.5">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium">
                              {s.current ? 'Cet appareil' : 'Autre appareil'}
                              {s.current && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">active</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              ouverte le {new Date(s.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={revokeSessions} disabled={revoking || !sessions || sessions.length <= 1}>
                    {revoking ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <LogOut className="mr-1.5 size-3.5" />}
                    Déconnecter les autres appareils
                  </Button>
                </section>

                <Separator />

                <section aria-label="Changer de mot de passe" className="space-y-2.5">
                  <h3 className="text-sm font-semibold">Changer de mot de passe</h3>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Mot de passe actuel"
                    autoComplete="current-password"
                    aria-label="Mot de passe actuel"
                  />
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nouveau mot de passe (8 caractères min.)"
                    autoComplete="new-password"
                    aria-label="Nouveau mot de passe"
                  />
                  <Button
                    variant="secondary"
                    onClick={changePassword}
                    disabled={savingPassword || !currentPassword || newPassword.length < 8}
                    className="w-full"
                  >
                    {savingPassword && <Loader2 className="mr-1 size-4 animate-spin" />}
                    Mettre à jour le mot de passe
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Compte créé via Google, Apple ou code e-mail ? Utilisez « Mot de passe oublié »
                    depuis l&apos;écran de connexion pour définir un mot de passe.
                  </p>
                </section>
              </TabsContent>

              {/* ─── Données ────────────────────────────────────────────── */}
              <TabsContent value="data" className="mt-0 space-y-4">
                <section aria-label="Export" className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <FileJson className="size-4 text-primary" /> Exporter toutes mes données
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Téléchargez un fichier JSON complet : profil, conversations, messages, sources
                    web et journal d&apos;activité. Vos données restent les vôtres.
                  </p>
                  <a href={profileApi.exportUrl} download>
                    <Button variant="secondary" className="w-full">
                      <Download className="mr-2 size-4" /> Télécharger mon export JSON
                    </Button>
                  </a>
                </section>

                <Separator />

                <section aria-label="Journal d'activité" className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Activity className="size-4 text-primary" /> Journal d&apos;activité (20 dernières actions)
                  </h3>
                  {eventsLoading && !events && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Chargement…
                    </div>
                  )}
                  {events && (
                    <ul className="space-y-1">
                      {events.length === 0 && (
                        <li className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">
                          Aucune action enregistrée pour le moment.
                        </li>
                      )}
                      {events.map((ev) => (
                        <li key={ev.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]">
                          <span className="min-w-0 truncate font-mono">{ev.action}</span>
                          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                            <span className={cn('font-semibold', ev.status < 400 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                              {ev.status}
                            </span>
                            <span className="tabular-nums">{ev.durationMs} ms</span>
                            <span>{new Date(ev.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Chaque action serveur (chat, image, recherche, authentification) est journalisée
                    avec son statut et sa durée — transparence totale.
                  </p>
                </section>
              </TabsContent>

              {/* ─── Application ────────────────────────────────────────── */}
              <TabsContent value="app" className="mt-0 space-y-4">
                <section aria-label="Application installée" className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-2xl border bg-card/70 p-3.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/drax-192.png" alt="Logo DRAX IA" width={44} height={44} className="rounded-[22%]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">DRAX IA</div>
                      <div className="text-xs text-muted-foreground">
                        {isStandalone ? (
                          <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3.5" /> Application installée
                          </span>
                        ) : (
                          'Installation en 30 secondes sur iPhone et Android'
                        )}
                      </div>
                    </div>
                  </div>
                  {!isStandalone && (
                    <Button className="w-full" onClick={onOpenInstallGuide}>
                      <Smartphone className="mr-2 size-4" /> Voir le guide d&apos;installation
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    L&apos;application s&apos;installe depuis votre navigateur (Safari sur iPhone,
                    Chrome sur Android) : pas d&apos;App Store, pas de compte supplémentaire, vos
                    conversations restent synchronisées.
                  </p>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold">Votre compte</h3>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li className="flex justify-between gap-2"><span>E-mail</span><span className="font-medium text-foreground">{user.email}</span></li>
                    <li className="flex justify-between gap-2"><span>Membre depuis</span><span className="font-medium text-foreground">{memberSince ?? '—'}</span></li>
                    <li className="flex justify-between gap-2"><span>Modèle par défaut</span><span className="font-medium text-foreground">{aiModel === 'reasoning' ? 'DRAX Raisonnement' : 'DRAX Rapide'}</span></li>
                  </ul>
                </section>

                <Separator />

                <section className="space-y-2.5">
                  <Button variant="outline" className="w-full" onClick={signOut}>
                    <LogOut className="mr-2 size-4" /> Se déconnecter
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 size-4" /> Supprimer mon compte
                  </Button>
                </section>
              </TabsContent>

              {/* ─── Serveur (propriétaire) ─────────────────────────────── */}
              <TabsContent value="serveur" className="mt-0">
                <ServerSettingsTab onErrorToast={onErrorToast} onSuccessToast={onSuccessToast} />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression de compte */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes vos conversations, messages, images et données personnelles seront effacés sans
              possibilité de récupération. Saisissez votre mot de passe pour confirmer
              (ou tapez exactement « SUPPRIMER » pour un compte Google / Apple / code e-mail).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            aria-label="Confirmation par mot de passe"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAccount}
              disabled={deleting || !deletePassword}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1 size-4 animate-spin" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ═══ Onglet Serveur — configuration des fournisseurs (propriétaire) ═══════════
// Permet de connecter Google OAuth et le serveur e-mail (Gmail + code) sans
// toucher aux fichiers : les identifiants sont stockés en base, chiffrés côté
// serveur (jamais renvoyés au navigateur — valeurs masquées).

function ConnexionBadge({ ok, okLabel, koLabel }: { ok: boolean; okLabel: string; koLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-3" /> {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="size-3" /> {koLabel}
    </span>
  )
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input readOnly value={value} className="h-8 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 px-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* presse-papiers indisponible */
            }
          }}
          aria-label="Copier"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function ServerSettingsTab({
  onErrorToast,
  onSuccessToast,
}: {
  onErrorToast: (m: string) => void
  onSuccessToast: (m: string) => void
}) {
  const [status, setStatus] = useState<ServerConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  // Google OAuth
  const [gClientId, setGClientId] = useState('')
  const [gSecret, setGSecret] = useState('')
  const [savingGoogle, setSavingGoogle] = useState(false)

  // SMTP (Gmail + code)
  const [sHost, setSHost] = useState('smtp.gmail.com')
  const [sPort, setSPort] = useState('587')
  const [sUser, setSUser] = useState('')
  const [sPass, setSPass] = useState('')
  const [sFrom, setSFrom] = useState('')
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await serverConfigApi.get()
      setStatus(s)
      setForbidden(false)
      if (s.smtp.configured && s.smtp.source === 'bdd') {
        setSHost(s.smtp.host ?? 'smtp.gmail.com')
        setSPort(String(s.smtp.port ?? 587))
        setSUser(s.smtp.user ?? '')
        setSFrom(s.smtp.from ?? '')
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true)
      else onErrorToast(e instanceof ApiError ? e.message : 'État du serveur indisponible.')
    } finally {
      setLoading(false)
    }
  }, [onErrorToast])

  useEffect(() => {
    load()
  }, [load])

  const saveGoogle = async () => {
    setSavingGoogle(true)
    try {
      const res = await serverConfigApi.update({
        section: 'google',
        clientId: gClientId.trim(),
        clientSecret: gSecret.trim(),
      })
      if (res.status) setStatus(res.status)
      onSuccessToast(res.message)
      setGSecret('')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la connexion Google.')
    } finally {
      setSavingGoogle(false)
    }
  }

  const saveSmtp = async () => {
    setSavingSmtp(true)
    try {
      const res = await serverConfigApi.update({
        section: 'smtp',
        host: sHost.trim(),
        port: Number(sPort) || 587,
        user: sUser.trim(),
        pass: sPass,
        from: sFrom.trim() || undefined,
      })
      if (res.status) setStatus(res.status)
      onSuccessToast(res.message)
      setSPass('')
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la connexion e-mail.')
    } finally {
      setSavingSmtp(false)
    }
  }

  const sendTest = async () => {
    setSendingTest(true)
    try {
      const res = await serverConfigApi.update({ section: 'test-smtp', to: testTo.trim() })
      onSuccessToast(res.message)
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : "L'envoi du test a échoué.")
    } finally {
      setSendingTest(false)
    }
  }

  const resetSection = async (section: 'google' | 'smtp' | 'apple') => {
    try {
      const res = await serverConfigApi.reset(section)
      setStatus(res.status)
      onSuccessToast(res.message)
    } catch (e) {
      onErrorToast(e instanceof ApiError ? e.message : 'Échec de la réinitialisation.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Chargement de la configuration…
      </div>
    )
  }

  if (forbidden || !status) {
    return (
      <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" /> Zone réservée au propriétaire du serveur
        </p>
        <p className="text-[13px] leading-relaxed">
          Le premier compte créé sur ce serveur est son propriétaire : c&apos;est lui qui connecte
          Google et l&apos;e-mail. Si vous venez d&apos;installer le serveur, créez le premier
          compte, puis revenez ici.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* État global */}
      <section aria-label="État des connexions" className="space-y-2 rounded-2xl border bg-card/70 p-3.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Server className="size-4 text-primary" /> État des connexions serveur
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            E-mail&nbsp;:
            {status.emailMode === 'real' ? (
              <ConnexionBadge ok okLabel="Mode réel (envoi activé)" koLabel="" />
            ) : (
              <ConnexionBadge ok={false} okLabel="" koLabel="Mode démo (code affiché à l'écran)" />
            )}
          </span>
          <span className="flex items-center gap-1.5">
            Google&nbsp;:
            <ConnexionBadge
              ok={status.google.configured}
              okLabel={`Connecté (${status.google.source === 'bdd' ? 'interface' : 'env'})`}
              koLabel="Non connecté"
            />
          </span>
          <span className="flex items-center gap-1.5">
            Apple&nbsp;:
            <ConnexionBadge
              ok={status.apple.configured}
              okLabel={`Connecté (${status.apple.source === 'bdd' ? 'interface' : 'env'})`}
              koLabel="Non connecté"
            />
          </span>
        </div>
      </section>

      {/* ─── Google OAuth ─────────────────────────────────────────────────── */}
      <section aria-label="Google OAuth" className="space-y-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound className="size-4 text-primary" /> Connexion Google (OAuth)
        </h3>
        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            Ouvrez{' '}
            <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              console.cloud.google.com <ExternalLink className="size-3" />
            </a>{' '}
            et créez un projet (ex. « DRAX IA »).
          </li>
          <li>API et services → Écran de consentement OAuth → type « Externe » → nommez l&apos;application.</li>
          <li>Identifiants → Créer des identifiants → ID client OAuth → Type « Application Web ».</li>
          <li>Dans « URI de redirection autorisés », collez exactement l&apos;adresse ci-dessous.</li>
          <li>Copiez le Client ID et le Client Secret ici, puis enregistrez.</li>
        </ol>
        <CopyField label="URI de redirection à enregistrer chez Google" value={status.redirectUris.google} />
        {status.google.configured && (
          <p className="text-[11px] text-muted-foreground">
            Actuel : <span className="font-mono">{status.google.clientIdMasked}</span>
            {status.google.source === 'bdd' && ' (défini depuis cette interface)'}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="srv-g-id" className="text-xs">Client ID Google</Label>
            <Input id="srv-g-id" value={gClientId} onChange={(e) => setGClientId(e.target.value)} placeholder="1234567890-xxxx.apps.googleusercontent.com" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="srv-g-secret" className="text-xs">Client Secret Google</Label>
            <Input id="srv-g-secret" type="password" value={gSecret} onChange={(e) => setGSecret(e.target.value)} placeholder={status.google.configured ? '•••• (laisser vide pour conserver)' : 'GOCSPX-…'} autoComplete="off" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveGoogle} disabled={savingGoogle || !gClientId.trim() || (!status.google.configured && !gSecret.trim())} className="flex-1">
            {savingGoogle && <Loader2 className="mr-1 size-4 animate-spin" />}
            {status.google.configured ? 'Mettre à jour Google' : 'Connecter Google'}
          </Button>
          {status.google.configured && status.google.source === 'bdd' && (
            <Button variant="outline" onClick={() => resetSection('google')} disabled={savingGoogle}>
              Déconnecter
            </Button>
          )}
        </div>
      </section>

      <Separator />

      {/* ─── Gmail + code (SMTP) ──────────────────────────────────────────── */}
      <section aria-label="Serveur e-mail" className="space-y-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Mail className="size-4 text-primary" /> Code par e-mail réel (Gmail + code)
        </h3>
        {status.emailMode === 'real' ? (
          <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-700 dark:text-emerald-400">
            Mode RÉEL actif : les codes à 6 chiffres partent réellement dans les boîtes e-mail
            ({status.smtp.user ?? status.smtp.host}).
          </p>
        ) : (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
            Mode DÉMO : aucun serveur e-mail n&apos;est connecté, le code s&apos;affiche à l&apos;écran.
            Connectez votre compte Gmail ci-dessous pour recevoir les codes dans la boîte.
          </p>
        )}
        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            Sur votre compte Google : activez la validation en deux étapes (
            <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              myaccount.google.com/security <ExternalLink className="size-3" />
            </a>
            ).
          </li>
          <li>
            Créez un « Mot de passe d&apos;application » (16 caractères) sur{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              myaccount.google.com/apppasswords <ExternalLink className="size-3" />
            </a>
            .
          </li>
          <li>Renseignez ci-dessous votre adresse Gmail + ce mot de passe d&apos;application, puis enregistrez.</li>
          <li>Cliquez « Recevoir un e-mail de test » : le code arrive dans votre boîte en quelques secondes.</li>
        </ol>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="srv-s-host" className="text-xs">Hôte SMTP</Label>
            <Input id="srv-s-host" value={sHost} onChange={(e) => setSHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="srv-s-port" className="text-xs">Port</Label>
            <Input id="srv-s-port" value={sPort} onChange={(e) => setSPort(e.target.value)} placeholder="587" inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="srv-s-user" className="text-xs">Votre adresse Gmail</Label>
            <Input id="srv-s-user" type="email" value={sUser} onChange={(e) => setSUser(e.target.value)} placeholder="vous@gmail.com" autoComplete="off" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="srv-s-pass" className="text-xs">Mot de passe d&apos;application</Label>
            <Input id="srv-s-pass" type="password" value={sPass} onChange={(e) => setSPass(e.target.value)} placeholder={status.smtp.configured ? '•••• (laisser vide pour conserver)' : 'abcd efgh ijkl mnop'} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="srv-s-from" className="text-xs">Expéditeur (optionnel)</Label>
            <Input id="srv-s-from" value={sFrom} onChange={(e) => setSFrom(e.target.value)} placeholder="DRAX IA &lt;vous@gmail.com&gt;" autoComplete="off" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveSmtp} disabled={savingSmtp || !sHost.trim() || !sUser.trim() || (!status.smtp.configured && !sPass)}>
            {savingSmtp && <Loader2 className="mr-1 size-4 animate-spin" />}
            {status.smtp.configured ? 'Mettre à jour l’e-mail' : 'Activer le mode réel'}
          </Button>
          {status.smtp.configured && status.smtp.source === 'bdd' && (
            <Button variant="outline" onClick={() => resetSection('smtp')} disabled={savingSmtp}>
              Repasser en mode démo
            </Button>
          )}
        </div>

        {status.smtp.configured && (
          <div className="space-y-1.5 rounded-xl border p-3">
            <Label htmlFor="srv-test-to" className="text-xs">Tester l&apos;envoi réel — recevoir un code d&apos;exemple dans la boîte</Label>
            <div className="flex gap-1.5">
              <Input id="srv-test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="adresse-à-tester@gmail.com" />
              <Button onClick={sendTest} disabled={sendingTest || !testTo.trim()} className="shrink-0">
                {sendingTest ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}
                Tester
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Envoie un vrai e-mail (avec un code d&apos;exemple) pour prouver que la chaîne fonctionne
              de bout en bout.
            </p>
          </div>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Sécurité : les secrets sont stockés côté serveur uniquement et ne sont jamais renvoyés au
        navigateur (valeurs masquées). Propriétaire du serveur = premier compte créé.
      </p>
    </div>
  )
}
