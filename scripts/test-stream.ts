// Test rapide du format de streaming du SDK z-ai-web-dev-sdk
import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  const zai = await ZAI.create();
  const stream = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'Tu es un assistant bref.' },
      { role: 'user', content: 'Compte de 1 à 5, un nombre par ligne.' },
    ],
    stream: true,
    thinking: { type: 'disabled' },
  } as any);

  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkCount++;
    buffer += decoder.decode(value, { stream: true });
    // Afficher les 2 premiers chunks bruts pour comprendre le format
    if (chunkCount <= 2) {
      console.log(`=== CHUNK BRUT #${chunkCount} ===`);
      console.log(JSON.stringify(decoder.decode(value)).slice(0, 500));
    }
    // Essayer de parser les lignes data:
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        console.log('--- [DONE] reçu ---');
        continue;
      }
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content ?? '';
        fullText += delta;
      } catch {
        // ligne non-JSON
      }
    }
  }
  console.log('Total chunks réseau:', chunkCount);
  console.log('Texte assemblé:', JSON.stringify(fullText));
}

main().catch((e) => {
  console.error('ERREUR:', e.message);
  process.exit(1);
});
