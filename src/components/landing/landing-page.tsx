'use client'

/**
 * Page d'accueil DRAX IA — motion design
 *
 * Principes respectés :
 *  - AUCUN contenu inventé : pas de faux utilisateurs, faux avis, faux
 *    compteurs. Chaque capacité présentée est réellement implémentée.
 *  - Images RÉELLES (sources web, stockées localement dans /public/landing).
 *  - Boutons interactifs qui redirigent vers l'application (ouverture de
 *    l'écran d'authentification puis accès au chat).
 *  - Animations : reveal au défilement, parallaxe légère, orbites, marquee,
 *    effets de survol — framer-motion.
 */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthView } from '@/components/chat/auth-view'
import { cn } from '@/lib/utils'

// ─── Variantes d'animation ───────────────────────────────────────────────────

const fadeInUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function LandingPage() {
  const [showAuth, setShowAuth] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 500], [0, 80])
  const glowOpacity = useTransform(scrollY, [0, 400], [0.9, 0.3])

  // Messages d'erreur issus des callbacks OAuth (?authError=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('authError')
    if (!err) return
    const messages: Record<string, string> = {
      'google-not-configured':
        'Connexion Google non configurée côté serveur (variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — voir README).',
      'apple-not-configured':
        'Connexion Apple non configurée côté serveur (variables APPLE_* — voir README).',
      'google-invalid-state': 'Session de connexion Google expirée. Réessayez.',
      'apple-invalid-state': 'Session de connexion Apple expirée. Réessayez.',
      'google-failed': 'La connexion Google a échoué. Réessayez.',
      'apple-failed': 'La connexion Apple a échoué. Réessayez.',
    }
    toast.error(messages[err] ?? 'Connexion impossible. Réessayez.')
    window.history.replaceState(null, '', '/')
  }, [])

  const openAuth = () => setShowAuth(true)

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#0b0f0e] text-[#e8f0ec] antialiased">
      {/* ── Fond animé : orbes lumineux ─────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <motion.div
          style={{ opacity: prefersReducedMotion ? 0.4 : glowOpacity }}
          className="absolute -top-40 left-1/2 h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-emerald-500/14 blur-[130px]"
        />
        <motion.div
          animate={prefersReducedMotion ? undefined : { y: [0, 40, 0], x: [0, -30, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[38%] -left-40 h-[420px] w-[420px] rounded-full bg-teal-400/10 blur-[110px]"
        />
        <motion.div
          animate={prefersReducedMotion ? undefined : { y: [0, -50, 0], x: [0, 25, 0] }}
          transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[55%] -right-40 h-[460px] w-[460px] rounded-full bg-emerald-300/10 blur-[120px]"
        />
        {/* grille fine */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e8f0ec 1px, transparent 1px), linear-gradient(to bottom, #e8f0ec 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
      </div>

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-[#0b0f0e]/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            {/* Logo officiel DRAX IA */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/drax-192.png"
              alt="Logo DRAX IA"
              width={36}
              height={36}
              className="size-9 rounded-[22%] shadow-[0_0_24px_rgba(59,130,246,0.5)]"
            />
            <span className="text-lg font-bold tracking-tight">DRAX IA</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex" aria-label="Navigation principale">
            <a href="#capacites" className="transition hover:text-white">Capacités</a>
            <a href="#apercu" className="transition hover:text-white">Aperçu</a>
            <a href="#securite" className="transition hover:text-white">Sécurité</a>
          </nav>
          <button
            type="button"
            onClick={openAuth}
            className="group inline-flex h-10 items-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-semibold text-[#0b0f0e] transition-all hover:bg-emerald-300 hover:shadow-[0_0_28px_rgba(52,211,153,0.5)]"
          >
            Ouvrir DRAX IA
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </motion.header>

      <main className="relative">
        {/* ── Héros ─────────────────────────────────────────────────────── */}
        <section className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-36 pb-20 text-center sm:px-6 lg:pt-44">
          <motion.div variants={fadeInUp} initial="hidden" animate="visible" custom={0}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-[13px] font-medium text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Génération d&apos;images, recherche web citée, dictée vocale
          </motion.div>

          <motion.h1
            variants={fadeInUp} initial="hidden" animate="visible" custom={1}
            className="mt-7 max-w-4xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
          >
            L&apos;assistant IA qui{' '}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent">
              répond, cherche et crée
            </span>
          </motion.h1>

          <motion.p variants={fadeInUp} initial="hidden" animate="visible" custom={2}
            className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
            DRAX IA répond en direct, s&apos;appuie sur des sources web citées, génère des images à
            partir de vos mots et vous écoute parler. Un compte suffit : Google, Apple, un code
            envoyé par e-mail ou un mot de passe.
          </motion.p>

          <motion.div variants={fadeInUp} initial="hidden" animate="visible" custom={3}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={openAuth}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-emerald-400 px-8 py-4 text-base font-bold text-[#0b0f0e] shadow-[0_0_40px_rgba(52,211,153,0.35)] transition-colors hover:bg-emerald-300"
            >
              {/* reflet balayant */}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
              <span className="relative">Commencer gratuitement</span>
              <ArrowRight className="relative size-5 transition-transform group-hover:translate-x-1" />
            </motion.button>
            <a
              href="#capacites"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-8 py-4 text-base font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Découvrir les capacités
            </a>
          </motion.div>

          {/* Visuel produit réel : capture d'usage d'un assistant conversationnel */}
          <motion.div
            style={{ y: prefersReducedMotion ? 0 : heroY }}
            variants={fadeInUp} initial="hidden" animate="visible" custom={4}
            className="relative mt-16 w-full max-w-4xl"
          >
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-r from-emerald-500/20 via-teal-400/10 to-emerald-500/20 blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              <Image
                src="/landing/usage-chat.jpg"
                alt="Assistant conversationnel en cours d'utilisation sur un écran, en ambiance sombre"
                width={1536} height={873}
                priority
                className="h-auto w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f0e]/50 via-transparent to-transparent" aria-hidden="true" />
            </div>

            {/* badges flottants réels */}
            <motion.div
              animate={prefersReducedMotion ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -left-3 top-8 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-[#101614]/90 px-4 py-3 text-left shadow-xl backdrop-blur sm:flex"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <Globe className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Recherche web</p>
                <p className="text-xs text-white/50">sources citées</p>
              </div>
            </motion.div>
            <motion.div
              animate={prefersReducedMotion ? undefined : { y: [0, 12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -right-3 bottom-10 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-[#101614]/90 px-4 py-3 text-left shadow-xl backdrop-blur sm:flex"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <ImageIcon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Images générées</p>
                <p className="text-xs text-white/50">à partir du texte</p>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Marquee capacités ─────────────────────────────────────────── */}
        <Marquee />

        {/* ── Capacités ─────────────────────────────────────────────────── */}
        <section id="capacites" className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center">
            <motion.p variants={fadeInUp} custom={0} className="text-sm font-semibold tracking-widest text-emerald-400 uppercase">Capacités</motion.p>
            <motion.h2 variants={fadeInUp} custom={1} className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Tout ce que DRAX IA sait vraiment faire
            </motion.h2>
            <motion.p variants={fadeInUp} custom={2} className="mx-auto mt-4 max-w-2xl text-white/55">
              Pas de promesses en l&apos;air : chaque capacité listée ici est implémentée et
              fonctionne dans l&apos;application.
            </motion.p>
          </motion.div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<MessageSquare className="size-6" />}
              title="Chat en direct, sans latence"
              body="Les réponses s'affichent au fil de l'eau (streaming). Vous pouvez interrompre, régénérer et relire tout l'historique, synchronisé sur tous vos appareils."
              delay={0}
            />
            <FeatureCard
              icon={<Globe className="size-6" />}
              title="Recherche web avec sources"
              body="Activez la recherche : DRAX IA interroge le web et cite chaque source utilisée (url, extrait, hôte) pour que vous puissiez vérifier."
              delay={1}
            />
            <FeatureCard
              icon={<ImageIcon className="size-6" />}
              title="Création d'images"
              body="Décrivez une scène, DRAX IA la génère. Onglet dédié dans le composeur ou demande en langage naturel — l'image est enregistrée dans votre conversation."
              delay={2}
            />
            <FeatureCard
              icon={<Mic className="size-6" />}
              title="Dictée vocale"
              body="Le bouton micro du composeur transcrit votre voix directement dans le champ texte, sur ordinateur comme sur téléphone (autorisation du micro demandée)."
              delay={3}
            />
            <FeatureCard
              icon={<ShieldCheck className="size-6" />}
              title="Connexion sans friction"
              body="Google, Apple, code à 6 chiffres envoyé par e-mail ou mot de passe : quatre méthodes réelles, une session sécurisée de 30 jours."
              delay={4}
            />
            <FeatureCard
              icon={<Zap className="size-6" />}
              title="Privé par défaut"
              body="Vos conversations vous appartiennent : sessions chiffrées, images accessibles par vous seul, suppression du compte en un geste."
              delay={5}
            />
          </div>
        </section>

        {/* ── Aperçu (alternance visuel / texte) ────────────────────────── */}
        <section id="apercu" className="relative mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6">
          <ShowcaseRow
            image="/landing/ai-laptop.jpg"
            alt="Ordinateur portable affichant une interface d'intelligence artificielle, néons rose et bleu"
            eyebrow="Conversation"
            title="Posez n'importe quelle question"
            body={[
              "DRAX IA traite vos demandes les plus variées : rédaction, résumés, code, traductions, brainstorming, explications pas à pas.",
              "Chaque conversation est créée automatiquement au premier message, nommée intelligemment, et reste dans la barre latérale.",
            ]}
            flip={false}
          />
          <ShowcaseRow
            image="/landing/network-nodes.png"
            alt="Réseau abstrait de nœuds lumineux interconnectés sur fond sombre"
            eyebrow="Recherche & création"
            title="Le web et la génération d'images, intégrés"
            body={[
              "Un sujet d'actualité ? La recherche web récupère des résultats récents et DRAX IA rédige une synthèse avec ses sources.",
              "Une illustration en tête ? Basculez sur l'onglet Images, décrivez-la, récupérez-la en un clic.",
            ]}
            flip
          />
          <ShowcaseRow
            image="/landing/neurons.jpg"
            alt="Filaments lumineux évoquant des neurones sur fond noir"
            eyebrow="Voix"
            title="Parlez, DRAX IA écrit"
            body={[
              "Le micro du composeur capte votre voix (après autorisation) et transcrit votre phrase dans le champ texte, en direct.",
              "Sur mobile, ouvrez DRAX IA dans le navigateur de votre téléphone : c'est le micro du téléphone qui est utilisé, avec votre permission.",
            ]}
            flip={false}
          />
        </section>

        {/* ── Sécurité ──────────────────────────────────────────────────── */}
        <section id="securite" className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/40 via-[#0d1211] to-[#0b0f0e]">
            <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
              <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
                <motion.p variants={fadeInUp} custom={0} className="text-sm font-semibold tracking-widest text-emerald-400 uppercase">Sécurité & vie privée</motion.p>
                <motion.h2 variants={fadeInUp} custom={1} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Vos données restent les vôtres
                </motion.h2>
                <motion.ul variants={fadeInUp} custom={2} className="mt-6 space-y-3.5 text-[15px] text-white/65">
                  {[
                    'Sessions opaques : seul un hachage du token est stocké côté serveur, le cookie est httpOnly.',
                    'Mots de passe hachés (bcrypt) ; les codes e-mail sont hachés, à usage unique et expirés après 10 minutes.',
                    'Images générées : stockage privé, accès vérifié session par session — personne d’autre ne peut les ouvrir.',
                    'Limitation de débit anti-abus sur toutes les routes sensibles (connexion, codes, génération).',
                    'Suppression du compte et des données en quelques secondes depuis les réglages.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </motion.ul>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <Image
                    src="/landing/hero-sphere.jpg"
                    alt="Sphère irisée lumineuse flottant sur fond noir — symbole de la protection des données"
                    width={1920} height={1280}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Appel à l'action final ────────────────────────────────────── */}
        <section className="relative mx-auto max-w-6xl px-4 pb-28 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-transparent px-6 py-16 text-center sm:px-12"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              Prêt à essayer&nbsp;?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/60">
              Ouvrez DRAX IA, connectez-vous en dix secondes et posez votre première question —
              ou dictez-la.
            </p>
            <div className="mt-8 flex justify-center">
              <motion.button
                type="button"
                onClick={openAuth}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-emerald-400 px-10 py-4 text-lg font-bold text-[#0b0f0e] shadow-[0_0_50px_rgba(52,211,153,0.4)] transition-colors hover:bg-emerald-300"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
                <span className="relative">Lancer DRAX IA</span>
                <ArrowRight className="relative size-5 transition-transform group-hover:translate-x-1.5" />
              </motion.button>
            </div>
            <p className="mt-5 text-xs text-white/40">
              Aucune carte bancaire. Aucune donnée revendue. Suppression à tout moment.
            </p>
          </motion.div>
        </section>
      </main>

      {/* ── Pied de page ────────────────────────────────────────────────── */}
      <footer className="relative border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-white/40 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <Sparkles className="size-4" />
            </span>
            <span className="font-semibold text-white/60">DRAX IA</span>
          </div>
          <p>Assistant IA conversationnel — chat, recherche web citée, création d&apos;images, dictée.</p>
        </div>
      </footer>

      {/* ── Overlay d'authentification ──────────────────────────────────── */}
      <AnimatePresence>
        {showAuth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="dark fixed inset-0 z-50 overflow-y-auto bg-[#0b0f0e]/95 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Connexion à DRAX IA"
          >
            <button
              type="button"
              onClick={() => setShowAuth(false)}
              aria-label="Fermer"
              className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
            <AuthView
              onAuthenticated={() => {
                // Session créée : rechargement → le serveur sert l'application
                window.location.reload()
              }}
              onErrorToast={(m) => toast.error(m)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function FeatureCard({ icon, title, body, delay }: { icon: React.ReactNode; title: string; body: string; delay: number }) {
  return (
    <motion.article
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      custom={delay}
      whileHover={{ y: -6 }}
      className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors hover:border-emerald-400/30 hover:bg-white/[0.05]"
    >
      <div className="absolute -top-16 -right-16 size-40 rounded-full bg-emerald-400/0 blur-3xl transition-all duration-500 group-hover:bg-emerald-400/15" aria-hidden="true" />
      <span className="relative inline-flex size-12 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 transition-transform duration-300 group-hover:scale-110">
        {icon}
      </span>
      <h3 className="relative mt-5 text-lg font-semibold">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-white/55">{body}</p>
    </motion.article>
  )
}

function ShowcaseRow({
  image, alt, eyebrow, title, body, flip,
}: {
  image: string; alt: string; eyebrow: string; title: string; body: string[]; flip: boolean
}) {
  return (
    <div className={cn('grid items-center gap-10 lg:grid-cols-2 lg:gap-16')}>
      <motion.div
        initial={{ opacity: 0, x: flip ? 50 : -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={cn('relative', flip && 'lg:order-2')}
      >
        <div className="absolute -inset-4 rounded-3xl bg-emerald-400/10 blur-2xl" aria-hidden="true" />
        <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-xl">
          <Image src={image} alt={alt} width={1200} height={800} loading="lazy" className="h-auto w-full object-cover transition-transform duration-700 hover:scale-[1.03]" />
        </div>
      </motion.div>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className={cn(flip && 'lg:order-1')}
      >
        <motion.p variants={fadeInUp} custom={0} className="text-sm font-semibold tracking-widest text-emerald-400 uppercase">{eyebrow}</motion.p>
        <motion.h3 variants={fadeInUp} custom={1} className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</motion.h3>
        {body.map((paragraph, i) => (
          <motion.p key={i} variants={fadeInUp} custom={2 + i} className="mt-4 leading-relaxed text-white/60">
            {paragraph}
          </motion.p>
        ))}
      </motion.div>
    </div>
  )
}

function Marquee() {
  const items = [
    'Réponses en streaming', 'Sources web citées', 'Création d\'images', 'Dictée vocale',
    'Connexion Google', 'Connexion Apple', 'Code par e-mail', 'Historique persistant',
  ]
  const doubled = [...items, ...items]
  return (
    <div className="relative border-y border-white/5 bg-white/[0.02] py-4" aria-hidden="true">
      <motion.div
        className="flex w-max gap-10"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-10 text-sm whitespace-nowrap text-white/45">
            {item}
            <span className="size-1.5 rounded-full bg-emerald-400/60" />
          </span>
        ))}
      </motion.div>
    </div>
  )
}
