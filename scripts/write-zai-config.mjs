/**
 * Préparation du moteur IA pour Vercel — DRAX AI
 *
 * Le SDK z-ai-web-dev-sdk lit sa configuration dans un fichier JSON
 * `.z-ai-config` (recherche : dossier du projet → home → /etc). Sur Vercel,
 * aucun de ces emplacements n'est écrivable à l'exécution : ce script crée
 * donc le fichier PENDANT LE BUILD à partir de deux variables
 * d'environnement définies dans le dashboard Vercel :
 *
 *   ZAI_API_KEY    — votre clé d'API du moteur IA (obligatoire)
 *   ZAI_BASE_URL   — l'URL de l'API (optionnelle : valeur par défaut ci-dessous)
 *
 * Le fichier est ensuite inclus dans le bundle serverless via
 * `outputFileTracingIncludes` (next.config.ts) — il est lu mais jamais
 * renvoyé au navigateur : tout reste côté serveur.
 *
 * Si ZAI_API_KEY n'est pas défini, le script n'échoue PAS (le build passe)
 * mais l'application répondra « moteur IA non configuré » à l'exécution.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4'

const apiKey = process.env.ZAI_API_KEY
const baseUrl = process.env.ZAI_BASE_URL || DEFAULT_BASE_URL

if (!apiKey) {
  console.warn(
    '\n[ZAI] ATTENTION : ZAI_API_KEY n\'est pas défini — le fichier .z-ai-config ' +
      "n'a pas été généré. L'application se déploiera mais le moteur IA (chat, images, " +
      "transcription vocale) sera indisponible jusqu'à configuration de la clé.\n",
  )
  process.exit(0)
}

const config = { baseUrl, apiKey }

writeFileSync(resolve(process.cwd(), '.z-ai-config'), JSON.stringify(config), { encoding: 'utf-8' })
console.log('[ZAI] .z-ai-config généré depuis les variables d\'environnement Vercel.')
