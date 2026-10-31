#!/bin/bash
# Test de bout en bout : POST /api/asr avec l'audio TTS de test
set -e
base64 -w0 /tmp/test-voice.wav > /tmp/test-voice.b64
echo "Taille audio b64: $(wc -c < /tmp/test-voice.b64) caractères"
python3 -c "
import json
audio = open('/tmp/test-voice.b64').read().strip()
json.dump({'audio': audio, 'mime': 'audio/wav'}, open('/tmp/asr-payload.json','w'))
"
echo "Payload prêt ($(wc -c < /tmp/asr-payload.json) octets)"
curl -s -b /tmp/asr-cookies.txt -X POST http://localhost:3000/api/asr \
  -H "Content-Type: application/json" \
  --data @/tmp/asr-payload.json \
  --max-time 120 \
  -w "\nHTTP: %{http_code}\n"
