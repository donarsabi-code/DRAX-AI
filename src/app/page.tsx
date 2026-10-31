import { getCurrentUser } from '@/lib/auth-server'
import { ChatApp } from '@/components/chat/chat-app'
import { LandingPage } from '@/components/landing/landing-page'

/**
 * Routage racine :
 *  - session valide  → application de chat DRAX IA ;
 *  - visiteur        → page d'accueil (motion design) avec accès auth.
 * cookies() rend la page dynamique : la session est évaluée à chaque requête.
 */
export default async function Home() {
  const user = await getCurrentUser().catch(() => null)
  if (user) return <ChatApp />
  return <LandingPage />
}
