/**
 * Test réel de génération d'images — reproduit exactement
 * ce que fait src/lib/image-service.ts (zai.images.generations.create)
 */
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const PROMPTS = [
  'générer une image d\'un homme agitant la main de loin à un chat, 4k, ultra réaliste',
  'A cute cat playing in the garden, high quality, detailed',
]

async function main() {
  const zai = await ZAI.create()
  for (const prompt of PROMPTS) {
    const t0 = Date.now()
    try {
      const result = await zai.images.generations.create({ prompt, size: '1024x1024' })
      const base64 = result?.data?.[0]?.base64 ?? ''
      if (!base64) {
        console.log(`[ÉCHEC] "${prompt}" → réponse vide (${Date.now() - t0} ms)`)
        console.log('  réponse brute:', JSON.stringify(result).slice(0, 300))
        continue
      }
      const buf = Buffer.from(base64, 'base64')
      const out = `/tmp/test-img-${Date.now()}.png`
      fs.writeFileSync(out, buf)
      console.log(`[OK] "${prompt}" → ${buf.length} octets, PNG=${buf[0] === 0x89}, ${Date.now() - t0} ms → ${out}`)
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; name?: string }
      console.log(`[ERREUR] "${prompt}" → ${err.name}: ${err.message} (status: ${err.status ?? 'n/a'}, ${Date.now() - t0} ms)`)
    }
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
