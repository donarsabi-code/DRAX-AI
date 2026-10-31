// Test de l'outil web_search du SDK
import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  const zai = await ZAI.create();
  const result = await zai.functions.invoke('web_search', {
    query: 'actualités intelligence artificielle octobre 2026',
    num: 3,
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 1500));
}

main().catch((e) => {
  console.error('ERREUR:', e.message);
  process.exit(1);
});
