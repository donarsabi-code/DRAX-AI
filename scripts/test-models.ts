/**
 * Test SDK : quels modèles réels sont disponibles ?
 * 1) appel par défaut (aucun `model`) → le champ `model` de la réponse donne l'ID réel
 * 2) appel avec thinking: enabled → vérifie que le mode raisonnement fonctionne
 */
import ZAI from 'z-ai-web-dev-sdk'

async function main() {
  const zai = await ZAI.create()

  // 1) Défaut
  const def = await zai.chat.completions.create({
    messages: [{ role: 'user', content: 'Réponds uniquement: OK1' }],
    thinking: { type: 'disabled' },
  })
  console.log('DEFAULT model:', JSON.stringify(def?.model ?? def?.choices?.[0]?.model ?? 'unknown'))
  console.log('DEFAULT content:', (def?.choices?.[0]?.message?.content ?? '').slice(0, 60))

  // 2) Thinking activé
  const think = await zai.chat.completions.create({
    messages: [{ role: 'user', content: 'Réponds uniquement: OK2' }],
    thinking: { type: 'enabled' },
  })
  console.log('THINK model:', JSON.stringify((think as any)?.model ?? 'unknown'))
  const msg = (think as any)?.choices?.[0]?.message
  console.log('THINK content:', (msg?.content ?? '').slice(0, 60))
  console.log('THINK reasoning present:', Boolean((msg as any)?.reasoning_content))
}

main().catch((e) => {
  console.error('TEST FAILED:', e?.message ?? e)
  process.exit(1)
})
