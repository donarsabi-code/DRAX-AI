'use client'

/**
 * Guide d'installation de l'application DRAX IA (PWA) — DRAX IA
 *
 * Reproduit fidèlement le parcours « Ajouter à l'écran d'accueil » vu en
 * vidéo : un panneau avec le logo, la promesse « Gratuit · 30 secondes ·
 * aucune place prise », le choix iPhone / Android, puis 4 étapes animées
 * (apparition séquentielle) avec de fausses cartes d'interface Safari /
 * Chrome reproduites en CSS :
 *   1. Touche le bouton Partager (Safari : barre du bas / Chrome : menu ⋮)
 *   2. Touche « Sur l'écran d'accueil » (menu contextuel, option en surbrillance)
 *   3. Touche « Ajouter » en haut à droite (popup de confirmation)
 *   4. C'est fait ! — l'icône DRAX IA est sur ton téléphone
 *
 * La fermeture (« Plus tard » / « J'ai installé ✓ ») est persistée en base
 * (User.installGuideDismissed) pour ne plus l'afficher automatiquement.
 */

import { useMemo, useState } from 'react'
import {
  Check,
  Download,
  Plus,
  Share,
  Share2,
  Smartphone,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Platform = 'ios' | 'android'

interface InstallGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Appelé quand l'utilisateur ferme le guide (« Plus tard » ou « J'ai installé ») */
  onDismiss: () => void
}

/** Détecte la plateforme la plus probable à partir du user agent. */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'ios'
  const ua = navigator.userAgent.toLowerCase()
  if (/android/.test(ua)) return 'android'
  return 'ios'
}

/** Icône de marque arrondie (logo officiel) — utilisée dans les fausses cartes. */
function BrandIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/drax-192.png"
      alt=""
      width={size}
      height={size}
      className={cn('rounded-[22%] object-cover shadow-sm', className)}
      style={{ width: size, height: size }}
    />
  )
}

/** Barre d'outils Safari (bas) ou Chrome (haut) — maquette. */
function BrowserMock({ platform, highlightShare }: { platform: Platform; highlightShare: boolean }) {
  if (platform === 'ios') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border bg-white/95 px-3 py-2 shadow-sm dark:bg-zinc-900/95">
        <span className="text-zinc-400">‹</span>
        <span className="text-zinc-400">›</span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg transition-all',
            highlightShare
              ? 'animate-pulse-ring bg-blue-500/15 text-blue-600 dark:text-blue-400'
              : 'text-zinc-400',
          )}
        >
          <Share className="size-4" />
        </span>
        <span className="text-zinc-400">□</span>
        <span className="text-zinc-400">⧉</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border bg-white/95 px-3 py-2 shadow-sm dark:bg-zinc-900/95">
      <span className="text-zinc-400">‹</span>
      <span className="text-zinc-400">›</span>
      <span className="flex-1 rounded-full bg-zinc-100 px-3 py-1 text-center text-[11px] text-zinc-500 dark:bg-zinc-800">
        drax-ia.app
      </span>
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-lg text-sm font-bold transition-all',
          highlightShare
            ? 'animate-pulse-ring bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'text-zinc-400',
        )}
      >
        ⋮
      </span>
    </div>
  )
}

/** Menu contextuel « Partager… » avec l'option clé en surbrillance. */
function ShareSheetMock({ platform }: { platform: Platform }) {
  const label = platform === 'ios' ? 'Sur l\'écran d\'accueil' : 'Ajouter à l\'écran d\'accueil'
  return (
    <div className="overflow-hidden rounded-2xl border bg-white/97 shadow-lg dark:bg-zinc-900/97">
      <div className="border-b px-3 py-1.5 text-center text-[11px] text-zinc-400">Fais glisser vers le haut si tu ne vois pas l&apos;option</div>
      <div className="space-y-0.5 p-2">
        <div className="rounded-lg px-3 py-2 text-sm text-zinc-500">Copier</div>
        <div className="rounded-lg px-3 py-2 text-sm text-zinc-500">Ajouter aux favoris</div>
        <div className="flex items-center justify-between rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-500 dark:bg-amber-500/10 dark:text-amber-400">
          {label}
          <Plus className="size-4" />
        </div>
      </div>
    </div>
  )
}

/** Popup « Ajouter à l'écran d'accueil » avec bouton Ajouter. */
function AddPopupMock({ platform }: { platform: Platform }) {
  const isIos = platform === 'ios'
  return (
    <div className="overflow-hidden rounded-2xl border bg-white/97 shadow-lg dark:bg-zinc-900/97">
      <div className="flex items-center justify-between border-b px-3 py-2 text-[12px]">
        <span className="text-blue-600 dark:text-blue-400">Annuler</span>
        <span className="font-semibold">{isIos ? 'Écran d\'accueil' : 'Ajouter à l\'écran d\'accueil'}</span>
        <span className="animate-pulse-ring rounded-full bg-blue-600 px-2.5 py-1 font-semibold text-white">{isIos ? 'Ajouter' : 'Ajouter'}</span>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <BrandIcon size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">DRAX IA</div>
          <div className="truncate text-[11px] text-zinc-400">drax-ia.app</div>
        </div>
      </div>
    </div>
  )
}

/** Dock factice avec l'icône DRAX IA mise en avant (étape 4). */
function DockMock() {
  return (
    <div className="flex items-end justify-center gap-3 rounded-3xl bg-gradient-to-b from-indigo-200/70 to-indigo-300/70 p-4 dark:from-indigo-900/40 dark:to-indigo-800/40">
      <div className="size-12 rounded-[22%] bg-zinc-300/60 dark:bg-zinc-700/60" />
      <div className="size-12 rounded-[22%] bg-zinc-300/60 dark:bg-zinc-700/60" />
      <div className="animate-bounce-in drop-shadow-[0_6px_18px_rgba(59,130,246,0.45)]">
        <BrandIcon size={52} />
      </div>
      <div className="size-12 rounded-[22%] bg-zinc-300/60 dark:bg-zinc-700/60" />
    </div>
  )
}

export function InstallGuide({ open, onOpenChange, onDismiss }: InstallGuideProps) {
  const [platform, setPlatform] = useState<Platform>('ios')

  // Détection automatique à l'ouverture (ajustement d'état pendant le rendu,
  // motif recommandé par React — évite un effet à rendu en cascade)
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setPlatform(detectPlatform())
  }

  const steps = useMemo(
    () => [
      {
        title: 'Touche le bouton Partager',
        hint:
          platform === 'ios'
            ? 'En bas de l\'écran dans Safari (en haut à droite dans Chrome).'
            : 'Touche le menu ⋮ en haut à droite de Chrome.',
        content: <BrowserMock platform={platform} highlightShare />,
      },
      {
        title: platform === 'ios' ? 'Touche « Sur l\'écran d\'accueil »' : 'Touche « Ajouter à l\'écran d\'accueil »',
        hint: 'Fais glisser le menu vers le haut si tu ne le vois pas.',
        content: <ShareSheetMock platform={platform} />,
      },
      {
        title: 'Touche « Ajouter » en haut à droite',
        hint: 'Confirme l\'installation de l\'application.',
        content: <AddPopupMock platform={platform} />,
      },
      {
        title: 'C\'est fait !',
        hint: 'L\'icône DRAX IA est sur ton téléphone. Ouvre-la comme une app.',
        content: <DockMock />,
      },
    ],
    [platform],
  )

  const handleClose = () => {
    onOpenChange(false)
    onDismiss()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : handleClose())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="animate-bounce-in drop-shadow-[0_10px_30px_rgba(59,130,246,0.35)]">
            <BrandIcon size={64} />
          </div>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            Installer DRAX IA
          </DialogTitle>
          <DialogDescription className="text-center">
            Gratuit · 30 secondes · aucune place prise
          </DialogDescription>
        </DialogHeader>

        {/* Sélecteur de plateforme (détection auto) */}
        <div className="mx-auto grid w-full max-w-60 grid-cols-2 gap-1 rounded-xl border bg-muted/50 p-1" role="tablist" aria-label="Choisir la plateforme">
          {(
            [
              { key: 'ios' as Platform, label: 'iPhone', icon: Smartphone },
              { key: 'android' as Platform, label: 'Android', icon: Smartphone },
            ]
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={platform === key}
              onClick={() => setPlatform(key)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                platform === key
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-ring/20'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Étapes animées (apparition séquentielle) */}
        <ol className="space-y-3.5" aria-label="Étapes d'installation">
          {steps.map((step, i) => (
            <li
              key={`${platform}-${i}`}
              className="animate-fade-up rounded-2xl border bg-card/80 p-3.5 shadow-sm"
              style={{ animationDelay: `${i * 220}ms` }}
            >
              <div className="mb-2 flex items-start gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
                  {i === steps.length - 1 ? <Check className="size-4" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold leading-snug">{step.title}</h4>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{step.hint}</p>
                </div>
              </div>
              {step.content}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2">
          <Button onClick={handleClose} className="w-full" size="lg">
            <Download className="mr-2 size-4" />
            J&apos;ai installé l&apos;application ✓
          </Button>
          <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground">
            <X className="mr-2 size-4" />
            Plus tard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
