/**
 * Détection d'intention « génération d'image » — DRAX IA Chat
 *
 * Permet à l'utilisateur de demander une image en langage naturel dans la
 * conversation normale (« génère une image de chat », "draw a cat", « 画一只猫 »)
 * sans avoir à activer l'onglet Images du composeur.
 *
 * Stratégie (haute précision, sans appel IA supplémentaire) :
 *  1. Exclusions : questions de méthode (« comment générer une image en Python ? »),
 *     questions de capacité générique (« tu peux générer des images ? »),
 *     contextes techniques (code, schémas) et retouche d'image existante.
 *  2. Déclencheurs : verbe d'action ou de volonté + nom d'image (FR/EN/ZH),
 *     ou motif direct « image de <sujet> » en début de message.
 *  3. Extraction du prompt : la commande est retirée pour ne garder que la
 *     description du visuel (« génère une image d'un chat astronaute » →
 *     « un chat astronaute »).
 *
 * La fonction est pure et sans dépendance → testable unitairement.
 */

export interface ImageIntent {
  isImageRequest: boolean
  /** Description nettoyée à envoyer au générateur (si isImageRequest). */
  prompt: string | null
}

// ─── Vocabulaire ─────────────────────────────────────────────────────────────

/** Noms désignant un visuel générable (FR/EN/ZH). */
const NOUN = String.raw`(?:images?|photos?|dessins?|illustrations?|ic[oô]nes?|avatars?|logos?|affiches?|visuels?|portraits?|peintures?|tableaux?|fresques?|pictures?|pics?|drawings?|paintings?|artworks?|wallpapers?|posters?|sketch(?:es)?|icons?|cover art)`

/** Verbes d'action orientés dessin/peinture : l'objet direct devient le visuel. */
const DRAW_VERB = String.raw`(?:dessin\w*|peins?(?:tre|s|t|ez)?|draw(?:s|ing)?|sketch(?:es)?)`

/** Verbes d'action généraux (générer, créer, faire…). */
const ACTION_VERB = String.raw`(?:g[eé]n[eèé]r\w*|cr[éeé]\w*|fais(?:ant)?|faites?|faire|imagine\w*|produis\w*|r[eé]alis\w*|trace[zr]?|generate[sd]?|generating|create[sd]?|creating|make[s]?|making|paint(?:s|ed|ing)?|design(?:s|ed|ing)?|render(?:s|ed|ing)?|produce[sd]?|生成|绘制|畫|画)`

/** Verbes/formules de volonté (« je veux une image… », "give me a picture…"). */
const DESIRE = String.raw`(?:je\s+(?:veux|voudrais|souhaite|d[eé]sire)|j['’]aimerais|j['’]aimerai|donne[-\s]moi|envoie[-\s]moi|montre[-\s]moi|fais[-\s]moi|i\s+(?:want|need|would like|'d like)|give\s+me|show\s+me|send\s+me|draw\s+me)`

// ─── Exclusions (prioritaires) ───────────────────────────────────────────────
// (exportées uniquement pour les tests unitaires)

export const EXCLUSIONS: RegExp[] = [
  // Question de méthode, début de message (« comment générer… », "how to…")
  /^\s*(?:comment|pourquoi|quels?\b|quelles?\b|qu['’]est[-\s]ce\s+que|c['’]est\s+quoi|explique(?:r|[-\s]moi)?|parle(?:[-\s]moi)?\s+de|dis[-\s]moi\s+(?:ce\s+que|comment))/i,
  /^\s*(?:how\s|why\s|what\s|when\s|which\s|where\s)/i,
  /^\s*(?:怎么|如何|为什么|什么是|请解释|请问)/,
  // « comment … générer/créer/dessiner » même en milieu de message
  /\bcomment\b[^.?!]{0,40}\b(?:g[eé]n[eèé]r\w*|cr[éeé]\w*|dessin\w*|fais\w*|faire|draw|create|generate|make)\b/i,
  /\bhow\s+(?:do|can|to|would)\b[^.?!]{0,40}\b(?:generate|create|draw|make|paint|design)\b/i,
  // Contexte programmation / technique : l'utilisateur veut du CODE, pas une image
  /\b(?:en|avec|dans|using|in|with)\s+(?:python|javascript|typescript|java|c\+\+|c#|php|ruby|rust|golang|\bgo\b|html|css|sql|bash|react|node(?:\.?js)?|swift|kotlin|matlab|excel|latex|tailwind|prisma|next\.?js)\b/i,
  /\b(?:python|javascript|typescript|php|react|next\.?js)\s+(?:code|script|regex|component|composant|fonction|function|class|classe)\b/i,
  /\b(?:code|script|page|fichier|snippet|balise|tag|attribut)\s+(?:html|css|sql|python|javascript|typescript|php|bash|react|java|c\+\+|xml|json|source)\b/i,
  /\b(?:code source|une fonction|un script|un composant|une api|une regex|une requ[eê]te sql|a function|a script|a component|a regex|an api|source code|unit tests?|tests? unitaires)\b/i,
  // Schémas techniques : le rendu IA artistique n'est pas adapté
  /\b(?:sch[eé]ma|schema|diagramme|diagram|organigramme|flowchart|graphique(?:\s+de)?|mind\s?map|carte\s+mentale|uml|mermaid)\b/i,
  // Capacité générique plurielle en question (« tu peux générer des images ? »)
  /\b(?:des|les|vos|tes|the|some)\s+(?:images|photos|dessins|illustrations|pictures|drawings)\b[^.?!]*\?/i,
  /(?:tu|vous|can\s+you|could\s+you|do\s+you)[^.?!]{0,25}\b(?:g[eé]n[eèé]r\w*|cr[éeé]\w*|draw|create|generate|make)\b[^.?!]{0,20}\b(?:des|les|the|some)\s+(?:images|photos|dessins|illustrations|pictures)\b/i,
  // Retouche / manipulation d'une image existante (non supporté ici)
  /\b(?:retouch\w*|modifi\w*|[eé]dit\w*|change(?:r|z|s)?|remplac\w*|rogn\w*|redimensionn\w*|crop|resize|upscale|modify)\b[^.?!]{0,25}\b(?:images?|photos?|dessin\w*|picture|drawing|photo)\b/i,
  // Référence à une image déjà générée dans la conversation
  /\/api\/images\/file\//i,
  /(?:l['’]|la|cette|ton|votre)\s+(?:image|photo|dessin)\s+(?:que\s+tu|pr[eé]c[eé]dente|g[eé]n[eé]r[eé]e)/i,
]

// ─── Déclencheurs ────────────────────────────────────────────────────────────
// (exportés uniquement pour les tests unitaires)

export const TRIGGERS: RegExp[] = [
  // FR : verbe d'action + nom d'image à proximité (« génère une image de… »)
  new RegExp(String.raw`${ACTION_VERB}\b[^.?!]{0,40}?${NOUN}\b`, 'i'),
  // FR : volonté + nom d'image (« je voudrais une illustration de… »)
  new RegExp(String.raw`${DESIRE}\b[^.?!]{0,40}?${NOUN}\b`, 'i'),
  // EN : action/volonté + nom d'image ("generate an image of…", "give me a picture…")
  new RegExp(
    String.raw`\b(?:generate|create|draw|make|paint|design|render|produce|give\s+me|show\s+me|send\s+me|i\s+want|i\s+need|i(?:'d|\s+would)\s+like)\b[^.?!]{0,40}?\b(?:an?\s+|the\s+|some\s+|my\s+)?${NOUN}\b`,
    'i',
  ),
  // Verbes de dessin : l'objet direct EST le visuel (« dessine-moi un chat »,
  // "draw a cat", « peins un coucher de soleil »)
  new RegExp(String.raw`^\s*(?:peux[-\s]tu\s+|pourrais[-\s]tu\s+|pouvez[-\s]vous\s+|pourriez[-\s]vous\s+|can\s+you\s+|could\s+you\s+|please\s+)?${DRAW_VERB}\b`, 'i'),
  new RegExp(String.raw`(?:^|\s)${DRAW_VERB}\b[^.?!]{0,40}?\S`, 'i'),
  // ZH : 生成/画 + nom de visuel à proximité (« 生成一张日落海边的图片 »)
  /(生成|绘制|畫|画)[\s\S]{0,20}?(?:图|圖|图片|圖片|图像|圖像|画像|插画|插圖|海报|海報|头像|頭像|logo)/,
  /画\s*一\s*[张張个個幅只頭头]/,
  // Motif direct « image de <sujet> » en début de message (« une image de chat »)
  new RegExp(String.raw`^\s*(?:une?\s+|des\s+|la\s+|an?\s+|the\s+)?${NOUN}\s+(?:d['’]|du|des\s+|de\s+|of\s+|pour|avec|showing|depicting|repr[eé]sentant|qui\s+montre)\s*\S`, 'i'),
]

// ─── Extraction du prompt ────────────────────────────────────────────────────

/** Fragments retirés du début du message pour isoler la description du visuel. */
const STRIP_STEPS: RegExp[] = [
  /^(?:s['’]il\s+(?:te|vous)\s+pla[îi]t|stp|svp|please)[\s,:!-]+/i,
  /^(?:peux[-\s]tu|pourrais[-\s]tu|pouvez[-\s]vous|pourriez[-\s]vous|can\s+you|could\s+you|would\s+you)[\s,:]+/i,
  /^(?:je\s+(?:veux|voudrais|souhaite|d[eé]sire)|j['’]aimerais?|i\s+(?:want|need)|i(?:'d|\s+would)\s+like)[\s,:]+/i,
  /^(?:请|帮我|给我|麻烦)[\s,:-]*/i,
  /^(?:g[eé]n[eèé]r\w*|cr[éeé]\w*|dessin\w*|peins?|peindre|fais(?:[-\s]moi)?|faites?|faire|imagine\w*|produis\w*|r[eé]alis\w*|trace[zr]?|generate|create|draw(?:\s+me)?|make(?:\s+me)?|paint|design|render|produce|give\s+me|show\s+me|send\s+me)\b[\s:,'’-]*/i,
  /^(?:生成|绘制|畫|画)\s*/,
  /^(?:moi|me|-me|-moi|for\s+me)[\s,:-]+/i,
  /^一?\s*[张張个個幅只頭头]\s*/,
  /^(?:une?|un|des|la|le|les|an?|the|my|mon|ma|some)\s+/i,
  new RegExp(String.raw`^(?:${NOUN})s?[\s:,'’-]*`, 'i'),
  /^(?:de|d['’]|du|des|sur|of|about|pour|avec|with|showing|depicting|repr[eé]sentant|qui\s+montre|qui\s+repr[eé]sente)[\s:,'’-]+/i,
  /^(?:une?|un|des|la|le|les|an?|the|my|mon|ma|some)\s+/i,
]

/**
 * Détecte si le message demande la création d'une image et en extrait
 * la description nettoyée. Longueur maximale analysée : 1000 caractères
 * (limite du générateur).
 */
export function detectImageIntent(rawText: string): ImageIntent {
  const text = (rawText ?? '').trim()
  if (text.length < 4 || text.length > 1000) {
    return { isImageRequest: false, prompt: null }
  }

  for (const rx of EXCLUSIONS) {
    if (rx.test(text)) return { isImageRequest: false, prompt: null }
  }

  const triggered = TRIGGERS.some((rx) => rx.test(text))
  if (!triggered) return { isImageRequest: false, prompt: null }

  return { isImageRequest: true, prompt: extractImagePrompt(text) }
}

/**
 * Isole la description du visuel : « Génère-moi une image d'un chat astronaute »
 * → « un chat astronaute ». Retombe sur le message complet si le nettoyage
 * aboutit à une chaîne vide (le générateur sait interpréter une phrase entière).
 */
export function extractImagePrompt(rawText: string): string {
  let s = (rawText ?? '').trim().replace(/\s+/g, ' ')
  const original = s

  for (const rx of STRIP_STEPS) {
    s = s.replace(rx, '').trim()
  }

  // Ponctuation résiduelle et formule de remerciement
  s = s
    .replace(/^[\s:,.!?·—–-]+/, '')
    .replace(/\b(?:merci|thanks|thank you)\b[.!]?\s*$/i, '')
    .replace(/\?+$/, '')
    .replace(/^(?:un|une|le|la|des|les)\s+/i, (m, ...args) => {
      // Conserver l'article si la phrase restante n'est qu'un nom nu trop court
      const rest = (args[1] as string) ?? ''
      return rest.trim().split(/\s+/).length <= 2 ? m : ''
    })
    .trim()

  if (s.replace(/[[\]()\\]/g, '').trim().length < 3) {
    s = original
  }

  // Caractères pouvant casser la notation Markdown du lien image
  s = s.replace(/[[\]()\\]/g, ' ').replace(/\s+/g, ' ').trim()

  return s.slice(0, 1000) || original.slice(0, 1000)
}
