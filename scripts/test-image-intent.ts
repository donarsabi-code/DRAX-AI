/**
 * Tests unitaires du détecteur d'intention image — Lumen Chat
 * Usage : npx tsx scripts/test-image-intent.ts
 */
import { detectImageIntent } from '../src/lib/image-intent'

interface Case {
  text: string
  expect: boolean
  note?: string
}

const POSITIVES: Case[] = [
  { text: 'Génère une image de chat', expect: true },
  { text: 'génère-moi une image d’un coucher de soleil sur la mer', expect: true },
  { text: 'Générer une image : un astronaute sur Mars', expect: true },
  { text: 'Crée une illustration d’un renard dans la forêt', expect: true },
  { text: 'Dessine-moi un chat', expect: true, note: 'verbe de dessin sans nom d’image' },
  { text: 'dessine un dragon crachant du feu', expect: true },
  { text: 'Peins un paysage montagneux à l’aquarelle', expect: true },
  { text: 'Je voudrais une image d’un chien qui joue au ballon', expect: true },
  { text: 'je veux une photo d’une plage tropicale', expect: true },
  { text: 'Fais-moi un dessin de tour Eiffel', expect: true },
  { text: 'une image de chat qui dort', expect: true, note: 'motif direct sans verbe' },
  { text: 'Peux-tu générer une image de lion ?', expect: true },
  { text: "Draw a cat", expect: true },
  { text: "Generate an image of a futuristic city", expect: true },
  { text: "Can you create a picture of a mountain lake?", expect: true },
  { text: "I want a photo of the Eiffel tower at night", expect: true },
  { text: '给我生成一张图片：一只可爱的猫', expect: true },
  { text: '画一只猫', expect: true },
  { text: '生成一张日落海边的图片', expect: true },
]

const NEGATIVES: Case[] = [
  { text: 'Comment générer une image en Python ?', expect: false, note: 'question de méthode + code' },
  { text: 'comment dessiner un chat au crayon', expect: false, note: 'tutoriel' },
  { text: 'Tu peux générer des images ?', expect: false, note: 'question de capacité générique' },
  { text: 'peux-tu créer des images à partir de mes photos ?', expect: false, note: 'capacité + retouche' },
  { text: 'Écris un script Python qui génère une image avec PIL', expect: false, note: 'code' },
  { text: 'Donne-moi le code HTML pour afficher une image', expect: false, note: 'code HTML' },
  { text: 'Dessine-moi un schéma de la base de données', expect: false, note: 'schéma technique' },
  { text: 'Crée un diagramme de Gantt pour mon projet', expect: false, note: 'diagramme' },
  { text: 'Modifie l’image que tu viens de générer', expect: false, note: 'retouche' },
  { text: 'Qu’est-ce qu’une image vectorielle ?', expect: false, note: 'définition' },
  { text: 'Explique-moi comment fonctionne la génération d’images par IA', expect: false },
  { text: 'Comment faire une photo de nuit nette ?', expect: false, note: 'conseil photo' },
  { text: 'Bonjour', expect: false },
  { text: 'abc', expect: false, note: 'trop court' },
  { text: 'What is a generative image model?', expect: false },
  { text: 'How to create a website?', expect: false },
  { text: '什么是生成式人工智能？', expect: false },
]

let pass = 0
let fail = 0
const failures: string[] = []

for (const c of [...POSITIVES, ...NEGATIVES]) {
  const res = detectImageIntent(c.text)
  const ok = res.isImageRequest === c.expect
  if (ok) pass++
  else {
    fail++
    failures.push(`  ✗ "${c.text}" → isImageRequest=${res.isImageRequest} (attendu ${c.expect})${c.note ? ` — ${c.note}` : ''}`)
  }
  if (ok && c.expect) {
    const p = res.prompt ?? ''
    if (p.length < 3) {
      fail++
      failures.push(`  ✗ prompt trop court pour "${c.text}" → "${p}"`)
    } else {
      console.log(`  ✓ "${c.text}" → prompt: "${p}"`)
    }
  }
}

console.log(`\n${pass}/${pass + fail} réussis`)
if (fail > 0) {
  console.log('ÉCHECS :')
  failures.forEach((f) => console.log(f))
  process.exit(1)
}
