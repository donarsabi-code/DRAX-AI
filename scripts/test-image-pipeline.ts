/**
 * Test de la solution image : traduction LLM → prompt anglais → génération + retry
 * Reproduit ce que ferait image-service.ts amélioré.
 */
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const USER_PROMPT = "générer une image d'un homme agitant la main de loin à un chat, 4k, ultra réaliste"

async function toEnglishPrompt(zai: Awaited<ReturnType<typeof ZAI.create>>, raw: string): Promise<string> {
  const res = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          'Tu convertis une demande utilisateur en un prompt concis pour un générateur d\'images. Réponds UNIQUEMENT par le prompt final en anglais, sans guillemets, sans explication, 40 mots maximum. Décris la scène visuelle (sujet, action, décor, style, qualité).',
      },
      { role: 'user', content: raw },
    ],
    thinking: { type: 'disabled' },
  })
  return (res?.choices?.[0]?.message?.content ?? '').replace(/^["'\s]+|["'\s]+$/g, '')
}

async function generateWithRetry(zai: Awaited<ReturnType<typeof ZAI.create>>, prompt: string, size: string, retries = 2) {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now()
      const result = await zai.images.generations.create({ prompt, size })
      const base64 = result?.data?.[0]?.base64 ?? ''
      if (!base64) throw new Error('réponse vide')
      console.log(`  tentative ${attempt}: OK ${Buffer.from(base64, 'base64').length} octets en ${Date.now() - t0} ms`)
      return base64
    } catch (e) {
      lastErr = e
      console.log(`  tentative ${attempt}: échec (${(e as Error).message.slice(0, 90)})`)
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2500))
    }
  }
  throw lastErr
}

async function main() {
  const zai = await ZAI.create()
  console.log('1) Prompt utilisateur:', USER_PROMPT)
  const t0 = Date.now()
  const en = await toEnglishPrompt(zai, USER_PROMPT)
  console.log(`2) Prompt traduit (${Date.now() - t0} ms):`, en)
  const base64 = await generateWithRetry(zai, en, '1024x1024')
  const buf = Buffer.from(base64, 'base64')
  const out = '/tmp/test-img-final.png'
  fs.writeFileSync(out, buf)
  const head = buf.subarray(0, 12)
  const isPng = head[0] === 0x89
  const isJpeg = head[0] === 0xff && head[1] === 0xd8
  console.log(`3) Image finale: ${buf.length} octets → ${out} (PNG=${isPng}, JPEG=${isJpeg})`)
}

main().catch((e) => { console.error('FATAL', e.message?.slice(0, 200)); process.exit(1) })
