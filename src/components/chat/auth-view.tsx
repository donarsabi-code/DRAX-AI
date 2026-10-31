'use client'

/**
 * Écrans d'authentification — DRAX IA Chat
 *
 * Correction du bug signalé : « quand je clique sur Inscription, les boutons
 * Google / Gmail+code disparaissent et ne répondent plus ».
 *
 * Structure corrigée :
 *  1. Les méthodes principales (Google, Apple, code e-mail) sont TOUJOURS
 *     visibles, quel que soit l'écran (inscription, connexion, mot de passe
 *     oublié…). Elles ne disparaissent plus jamais.
 *  2. Chaque bouton donne un retour visible et immédiat :
 *     - si le fournisseur n'est pas configuré côté serveur → encart inline
 *       ambre (pas seulement un toast) avec le point exact de configuration ;
 *     - si configuré → redirection réelle vers /api/auth/{google|apple}.
 *  3. Le formulaire d'inscription valide chaque champ en ligne (nom, e-mail,
 *     mot de passe) : le bouton « Créer mon compte » ne peut plus sembler
 *     « ne rien faire » — toute erreur est affichée sous le champ concerné.
 *
 * Méthodes proposées (toutes réelles, aucune simulation) :
 *  - Continuer avec Google   → OAuth 2.0 (redirection serveur /api/auth/google)
 *  - Continuer avec Apple    → OAuth 2.0 (redirection serveur /api/auth/apple)
 *  - Code envoyé par e-mail  → OTP 6 chiffres (connexion ET inscription)
 *  - Mot de passe (classique, conservé)
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { authApi, ApiError } from '@/lib/api-client'

type Mode = 'main' | 'email-code' | 'login' | 'register' | 'forgot' | 'confirm-reset'

interface AuthUserLite {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
}

interface AuthViewProps {
  onAuthenticated: (user: AuthUserLite) => void
  onErrorToast: (message: string) => void
}

type Providers = { google: boolean; apple: boolean; emailCode: boolean }

// ─── Logos officiels (SVG inline) ────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
    </svg>
  )
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  )
}

// ─── Écran principal ─────────────────────────────────────────────────────────

export function AuthView({ onAuthenticated, onErrorToast }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>('main')
  const [providers, setProviders] = useState<Providers | null>(null)
  // Encart inline : dernier message de feedback des boutons fournisseurs
  const [notice, setNotice] = useState<{ kind: 'info' | 'warn'; text: string } | null>(null)

  useEffect(() => {
    authApi
      .providers()
      .then(setProviders)
      .catch(() => setProviders({ google: false, apple: false, emailCode: false }))
  }, [])

  const goEmailCode = () => {
    setNotice(null)
    setMode('email-code')
  }

  const startGoogle = () => {
    if (providers && !providers.google) {
      setNotice({
        kind: 'warn',
        text: 'Google n’est pas encore connecté à ce serveur. Le propriétaire (premier compte créé) peut l’activer en 2 minutes : Dashboard → onglet « Serveur » → section Google (guide pas-à-pas intégré).',
      })
      onErrorToast('Google n’est pas encore configuré côté serveur.')
      return
    }
    setNotice({ kind: 'info', text: 'Redirection vers Google…' })
    window.location.href = '/api/auth/google'
  }

  const startApple = () => {
    if (providers && !providers.apple) {
      setNotice({
        kind: 'warn',
        text: 'Apple n’est pas encore connecté à ce serveur. Le propriétaire peut l’activer : Dashboard → onglet « Serveur » (identifiants Apple requis).',
      })
      onErrorToast('Apple n’est pas encore configuré côté serveur.')
      return
    }
    setNotice({ kind: 'info', text: 'Redirection vers Apple…' })
    window.location.href = '/api/auth/apple'
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Logo officiel DRAX IA */}
          <div className="animate-bounce-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/drax-logo.png"
              alt="Logo officiel DRAX IA"
              width={112}
              height={112}
              className="size-28 rounded-3xl object-cover shadow-[0_12px_40px_rgba(37,99,235,0.35)] ring-1 ring-primary/20"
            />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">DRAX IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre intelligence artificielle de nouvelle génération.
          </p>
        </div>

        {/* ── Méthodes principales : TOUJOURS visibles, sur TOUS les écrans ── */}
        <ProviderBlock
          providers={providers}
          onGoogle={startGoogle}
          onApple={startApple}
          onEmailCode={goEmailCode}
          activeMode={mode}
        />

        {notice && (
          <div
            role="status"
            className={
              notice.kind === 'warn'
                ? 'mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] leading-snug text-amber-700 dark:text-amber-400'
                : 'mt-3 flex items-start gap-2 rounded-lg border bg-muted px-3 py-2 text-[13px] leading-snug text-muted-foreground'
            }
          >
            {notice.kind === 'warn' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="mt-4">
          {mode === 'main' && (
            <MainChoice goPasswordLogin={() => { setNotice(null); setMode('login') }} goRegister={() => { setNotice(null); setMode('register') }} />
          )}
          {mode === 'email-code' && (
            <EmailCodeFlow onSuccess={onAuthenticated} goBack={() => { setNotice(null); setMode('main') }} onErrorToast={onErrorToast} />
          )}
          {mode === 'login' && (
            <LoginForm
              onSuccess={onAuthenticated}
              goRegister={() => { setNotice(null); setMode('register') }}
              goForgot={() => { setNotice(null); setMode('forgot') }}
              goBack={() => { setNotice(null); setMode('main') }}
              onErrorToast={onErrorToast}
            />
          )}
          {mode === 'register' && (
            <RegisterForm
              onSuccess={onAuthenticated}
              goLogin={() => { setNotice(null); setMode('login') }}
              goBack={() => { setNotice(null); setMode('main') }}
              onErrorToast={onErrorToast}
            />
          )}
          {mode === 'forgot' && <ForgotForm goLogin={() => { setNotice(null); setMode('login') }} onConfirm={(token) => setMode('confirm-reset')} />}
          {mode === 'confirm-reset' && <ConfirmResetForm goLogin={() => { setNotice(null); setMode('login') }} />}
        </div>
      </div>

      <p className="mt-8 max-w-xs text-center text-[11px] leading-relaxed text-muted-foreground">
        En continuant, vous acceptez que vos conversations soient enregistrées dans votre compte
        pour retrouver votre historique.
      </p>
    </main>
  )
}

// ─── Bloc fournisseur permanent (Google / Apple / code e-mail) ───────────────

function ProviderBlock({
  providers,
  onGoogle,
  onApple,
  onEmailCode,
  activeMode,
}: {
  providers: Providers | null
  onGoogle: () => void
  onApple: () => void
  onEmailCode: () => void
  activeMode: Mode
}) {
  const googleReady = providers?.google ?? false
  const appleReady = providers?.apple ?? false

  return (
    <div className="space-y-2.5" data-testid="auth-providers">
      <Button type="button" variant="outline" className="h-11 w-full justify-center rounded-xl" onClick={onGoogle}>
        <GoogleLogo className="mr-2 size-5" />
        Continuer avec Google
        {!googleReady && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">config. requise</span>}
      </Button>

      <Button type="button" variant="outline" className="h-11 w-full justify-center rounded-xl" onClick={onApple}>
        <AppleLogo className="mr-2 size-5" />
        Continuer avec Apple
        {!appleReady && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">config. requise</span>}
      </Button>

      <div className="flex items-center gap-3 py-0.5" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou par e-mail</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant={activeMode === 'email-code' ? 'secondary' : 'default'}
        className="h-11 w-full justify-center rounded-xl"
        onClick={onEmailCode}
      >
        <Mail className="mr-2 size-4" />
        Recevoir un code par e-mail
        {providers && !providers.emailCode && (
          <span className="ml-2 rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">mode démo</span>
        )}
      </Button>
      <p className="text-center text-[12px] text-muted-foreground">
        Un code à 6 chiffres crée votre compte s’il est nouveau, ou vous connecte sinon (Gmail ou autre).
      </p>
    </div>
  )
}

// ─── Choix secondaires (écran d'accueil uniquement) ──────────────────────────

function MainChoice({
  goPasswordLogin,
  goRegister,
}: {
  goPasswordLogin: () => void
  goRegister: () => void
}) {
  return (
    <div className="flex items-center justify-between pt-1 text-sm">
      <button type="button" onClick={goPasswordLogin} className="text-muted-foreground hover:text-foreground hover:underline">
        Mot de passe
      </button>
      <button type="button" onClick={goRegister} className="font-medium text-primary hover:underline">
        Créer un compte →
      </button>
    </div>
  )
}

// ─── Parcours code e-mail (connexion + inscription) ──────────────────────────

function EmailCodeFlow({
  onSuccess,
  goBack,
  onErrorToast,
}: {
  onSuccess: AuthViewProps['onAuthenticated']
  goBack: () => void
  onErrorToast: (m: string) => void
}) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [isNewAccount, setIsNewAccount] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.requestOtp(email)
      setIsNewAccount(res.isNewAccount)
      setDevCode(res.devCode ?? null)
      setStep('code')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Envoi impossible. Réessayez.'
      setError(msg)
      onErrorToast(msg)
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.verifyOtp({ email, code, displayName: displayName || undefined })
      onSuccess(res.user)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Vérification impossible. Réessayez.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading) request()
        }}
        className="space-y-4"
        aria-label="Connexion par code e-mail"
      >
        <p className="text-sm text-muted-foreground">
          Saisissez votre adresse e-mail (Gmail ou autre) : nous vous envoyons un code à 6 chiffres.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="otp-email">Adresse e-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="otp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="vous@gmail.com"
              className="pl-9"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          Recevoir un code
        </Button>
        <p className="text-center text-sm">
          <button type="button" onClick={goBack} className="text-muted-foreground hover:text-foreground hover:underline">
            Retour
          </button>
        </p>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6 && !loading) verify()
      }}
      className="space-y-4"
      aria-label="Vérification du code"
    >
      <p className="text-sm text-muted-foreground">
        Code envoyé à <span className="font-medium text-foreground">{email}</span>
        {isNewAccount ? ' — nouveau compte : il sera créé automatiquement.' : '.'}
      </p>

      {devCode && (
        <div className="space-y-1 rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">Mode développement uniquement :</p>
          <p className="text-muted-foreground">
            Aucun service e-mail (SMTP) n’est configuré sur ce serveur. Votre code :
          </p>
          <code className="block rounded bg-muted px-2 py-1.5 text-center font-mono text-lg tracking-widest">
            {devCode}
          </code>
        </div>
      )}

      <div className="flex justify-center">
        <InputOTP maxLength={6} value={code} onChange={setCode} disabled={loading}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {isNewAccount && (
        <div className="space-y-1.5">
          <Label htmlFor="otp-name">Votre nom (nouveau compte)</Label>
          <div className="relative">
            <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="otp-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              maxLength={40}
              placeholder="Votre prénom ou pseudo"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading || code.length !== 6}>
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Valider le code
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          disabled={resending || loading}
          onClick={async () => {
            setResending(true)
            setError(null)
            try {
              const res = await authApi.requestOtp(email)
              setDevCode(res.devCode ?? null)
              setCode('')
              onErrorToast('Nouveau code envoyé.')
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Renvoi impossible.')
            } finally {
              setResending(false)
            }
          }}
        >
          {resending ? 'Envoi…' : 'Renvoyer un code'}
        </button>
        <button type="button" onClick={goBack} className="text-muted-foreground hover:text-foreground hover:underline">
          Changer d’e-mail
        </button>
      </div>
    </form>
  )
}

// ─── Formulaires mot de passe (conservés) ────────────────────────────────────

function PasswordInput({
  value,
  onChange,
  label,
  autoComplete,
  id,
  error,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  autoComplete: string
  id: string
  error?: string | null
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={8}
          placeholder="Au moins 8 caractères"
          className="pl-9 pr-10"
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function LoginForm({
  onSuccess,
  goRegister,
  goForgot,
  goBack,
  onErrorToast,
}: {
  onSuccess: AuthViewProps['onAuthenticated']
  goRegister: () => void
  goForgot: () => void
  goBack: () => void
  onErrorToast: (m: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user } = await authApi.login({ email, password })
      onSuccess(user)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Connexion impossible. Réessayez.'
      setError(msg)
      onErrorToast(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Connexion">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Adresse e-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="vous@exemple.com"
            className="pl-9"
          />
        </div>
      </div>
      <PasswordInput id="login-password" label="Mot de passe" value={password} onChange={setPassword} autoComplete="current-password" />

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Se connecter
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={goBack} className="text-muted-foreground hover:text-foreground hover:underline">
          Autres méthodes
        </button>
        <div className="flex items-center gap-3">
          <button type="button" onClick={goForgot} className="text-muted-foreground hover:text-foreground hover:underline">
            Oublié ?
          </button>
          <button type="button" onClick={goRegister} className="font-medium text-primary hover:underline">
            Créer un compte
          </button>
        </div>
      </div>
    </form>
  )
}

function RegisterForm({
  onSuccess,
  goLogin,
  goBack,
  onErrorToast,
}: {
  onSuccess: AuthViewProps['onAuthenticated']
  goLogin: () => void
  goBack: () => void
  onErrorToast: (m: string) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Validation en ligne : chaque champ affiche son erreur précise sous lui
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({})

  const validate = (): boolean => {
    const errs: { name?: string; email?: string; password?: string } = {}
    if (displayName.trim().length < 2) errs.name = 'Le nom doit contenir au moins 2 caractères.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Adresse e-mail invalide.'
    if (password.length < 8) errs.password = 'Le mot de passe doit contenir au moins 8 caractères.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) {
      onErrorToast('Corrigez les champs signalés en rouge.')
      return
    }
    setLoading(true)
    try {
      const { user } = await authApi.register({ email, password, displayName })
      onSuccess(user)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Inscription impossible. Réessayez.'
      setError(msg)
      onErrorToast(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Inscription" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="reg-name">Nom affiché</Label>
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reg-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }))
            }}
            autoComplete="name"
            maxLength={40}
            placeholder="Votre prénom ou pseudo"
            className="pl-9"
            aria-invalid={!!fieldErrors.name}
          />
        </div>
        {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">Adresse e-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
            }}
            autoComplete="email"
            placeholder="vous@exemple.com"
            className="pl-9"
            aria-invalid={!!fieldErrors.email}
          />
        </div>
        {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
      </div>
      <PasswordInput
        id="reg-password"
        label="Mot de passe"
        value={password}
        onChange={(v) => {
          setPassword(v)
          if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }))
        }}
        autoComplete="new-password"
        error={fieldErrors.password}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Créer mon compte
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={goBack} className="text-muted-foreground hover:text-foreground hover:underline">
          Autres méthodes
        </button>
        <button type="button" onClick={goLogin} className="font-medium text-primary hover:underline">
          J&apos;ai déjà un compte
        </button>
      </div>
    </form>
  )
}

function ForgotForm({ goLogin, onConfirm }: { goLogin: () => void; onConfirm: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await authApi.requestPasswordReset(email)
      setSent(true)
      if (res.devResetToken) setDevToken(res.devResetToken)
      setMessage(res.message)
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Erreur. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Réinitialisation du mot de passe">
      {sent ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            {message}
          </p>
          {devToken && (
            <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Mode développement uniquement :</p>
              <p className="text-muted-foreground">
                Aucun service e-mail n&apos;est configuré sur ce serveur. Utilisez ce token unique (valide 1 h) :
              </p>
              <code className="block rounded bg-muted px-2 py-1.5 font-mono text-xs break-all">{devToken}</code>
              <Button type="button" variant="secondary" className="w-full" onClick={() => onConfirm(devToken)}>
                Continuer avec ce token
              </Button>
            </div>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={goLogin}>
            Retour à la connexion
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Saisissez votre adresse e-mail : nous générons une procédure de réinitialisation valable une heure.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Adresse e-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="vous@exemple.com"
                className="pl-9"
              />
            </div>
          </div>
          {message && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          )}
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Lancer la réinitialisation
          </Button>
          <p className="text-center text-sm">
            <button type="button" onClick={goLogin} className="text-muted-foreground hover:text-foreground hover:underline">
              Retour à la connexion
            </button>
          </p>
        </>
      )}
    </form>
  )
}

function ConfirmResetForm({ goLogin }: { goLogin: () => void }) {
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.confirmPasswordReset(token.trim(), newPassword)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          Mot de passe modifié. Vous pouvez maintenant vous connecter avec le nouveau mot de passe.
        </p>
        <Button type="button" className="w-full" onClick={goLogin}>
          Se connecter
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Nouveau mot de passe">
      <div className="space-y-1.5">
        <Label htmlFor="reset-token">Token de réinitialisation</Label>
        <Input
          id="reset-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          placeholder="Collez le token reçu"
          className="font-mono text-xs"
        />
      </div>
      <PasswordInput id="reset-password" label="Nouveau mot de passe" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Définir le nouveau mot de passe
      </Button>
      <p className="text-center text-sm">
        <button type="button" onClick={goLogin} className="text-muted-foreground hover:text-foreground hover:underline">
          Retour à la connexion
        </button>
      </p>
    </form>
  )
}
