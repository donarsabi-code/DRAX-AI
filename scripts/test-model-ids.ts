import ZAI from 'z-ai-web-dev-sdk'

const candidates = [
  'glm-4-plus',
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.5-flash',
  'glm-4.5v',
  'glm-4v-plus',
  'glm-4-flash',
  'glm-4-long',
  'glm-4-air',
  'glm-4.6',
]

async function main() {
  const zai = await ZAI.create()
  for (const model of candidates) {
    try {
      const r = await zai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Réponds uniquement: OK' }],
        thinking: { type: 'disabled' },
      })
      const ok = r?.choices?.[0]?.message?.content?.trim().slice(0, 20)
      console.log(`${model}: ✅ répond "${ok}" (modèle déclaré: ${r?.model ?? '?'})`)
    } catch (e: any) {
      console.log(`${model}: ❌ ${String(e?.message || e).slice(0, 90)}`)
    }
  }
}
main()
