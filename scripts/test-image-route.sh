#!/bin/bash
# Test de bout en bout : POST /api/images avec le prompt français exact de la capture
set -e
EMAIL=$(cat /tmp/asr-email.txt)
# Connexion fraîche (le cookie peut avoir expiré)
curl -s -c /tmp/asr-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"TestAsr2026!x\"}" -o /dev/null -w "login: %{http_code}\n"
python3 -c "
import json
json.dump({'prompt': \"générer une image d'un homme agitant la main de loin en train de taquiner un chat, 4k ultra réaliste\", 'size': '1024x1024'}, open('/tmp/img-payload.json','w'))
"
echo "Génération en cours (~60 s)…"
curl -s -b /tmp/asr-cookies.txt -X POST http://localhost:3000/api/images \
  -H "Content-Type: application/json" \
  --data @/tmp/img-payload.json \
  --max-time 240 \
  -w "\nHTTP: %{http_code}\n" | head -c 1200
