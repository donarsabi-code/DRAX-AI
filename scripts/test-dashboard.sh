#!/bin/bash
# Tests temps réel — DRAX IA (dashboard, avatar, stats, sessions, export, guide)
set -u
BASE="http://localhost:3000"
JAR="/tmp/drax-test-cookies.txt"
rm -f "$JAR"
EMAIL="drax-dash-test-$(date +%s)@example.com"
PASS="MotDePasse!123"

echo "── 1. Pages & assets statiques ─────────────────────────────────"
for p in "/" "/manifest.webmanifest" "/drax-logo.png" "/favicon.png" "/favicon.ico" "/apple-touch-icon.png" "/icons/drax-192.png" "/icons/drax-512.png" "/icons/drax-maskable-512.png" "/og-drax.png"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$p")
  echo "GET $p -> $code"
done

echo "── 2. Inscription ──────────────────────────────────────────────"
code=$(curl -s -o /tmp/reg.json -w "%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"Testeur DRAX\"}")
echo "POST /api/auth/register -> $code"

echo "── 3. /api/auth/me (champs bio + installGuideDismissed) ───────"
curl -s -b "$JAR" "$BASE/api/auth/me" | python3 -c "
import json,sys
d = json.load(sys.stdin)
u = d.get('user') or {}
print('user.bio:', u.get('bio'))
print('user.installGuideDismissed:', u.get('installGuideDismissed'))
print('user.displayName:', u.get('displayName'))
print('ai.models:', [m['displayName'] for m in (d.get('ai') or {}).get('models', [])])
"

echo "── 4. PATCH profil (bio + installGuideDismissed) ───────────────"
code=$(curl -s -o /tmp/patch.json -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/profile" \
  -H 'Content-Type: application/json' \
  -d '{"bio":"Fan de DRAX IA depuis 2026","installGuideDismissed":true}')
echo "PATCH /api/profile -> $code"; cat /tmp/patch.json | head -c 300; echo

echo "── 5. Stats ────────────────────────────────────────────────────"
code=$(curl -s -o /tmp/stats.json -w "%{http_code}" -b "$JAR" "$BASE/api/profile/stats")
echo "GET /api/profile/stats -> $code"
python3 -c "
import json
d = json.load(open('/tmp/stats.json'))
s = d['stats']
print('conversations:', s['conversations'], '| messages:', s['messagesTotal'], '| images:', s['imagesGenerated'], '| streak:', s['streak'], '| daily points:', len(s['daily']))
"

echo "── 6. Sessions ─────────────────────────────────────────────────"
code=$(curl -s -o /tmp/sess.json -w "%{http_code}" -b "$JAR" "$BASE/api/profile/sessions")
echo "GET /api/profile/sessions -> $code"
python3 -c "
import json
d = json.load(open('/tmp/sess.json'))
print('sessions:', len(d['sessions']), '| current:', d['sessions'][0]['current'] if d['sessions'] else 'n/a')
"

echo "── 7. Avatar : création PNG + upload + GET ─────────────────────"
python3 -c "
from PIL import Image
Image.new('RGB', (300, 300), (30, 90, 220)).save('/tmp/avatar-test.png')
"
code=$(curl -s -o /tmp/av.json -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/profile/avatar" -F "file=@/tmp/avatar-test.png;type=image/png")
echo "POST /api/profile/avatar -> $code"
code=$(curl -s -o /tmp/avatar-out.png -w "%{http_code}" -b "$JAR" "$BASE/api/profile/avatar")
echo "GET /api/profile/avatar -> $code ($(stat -c%s /tmp/avatar-out.png) octets)"
# Avatar sans session (isolation) :
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/profile/avatar")
echo "GET /api/profile/avatar SANS cookie (attendu 401) -> $code"

echo "── 8. Export JSON ──────────────────────────────────────────────"
code=$(curl -s -o /tmp/export.json -w "%{http_code}" -b "$JAR" "$BASE/api/profile/export")
echo "GET /api/profile/export -> $code ($(stat -c%s /tmp/export.json) octets)"
python3 -c "
import json
d = json.load(open('/tmp/export.json'))
print('application:', d['application'], '| conversations:', len(d['conversations']), '| messages:', len(d['messages']), '| journal:', len(d['activityLog']))
"

echo "── 9. Reprise de session : me reflète le PATCH ─────────────────"
curl -s -b "$JAR" "$BASE/api/auth/me" | python3 -c "
import json,sys
u = json.load(sys.stdin).get('user') or {}
print('bio persistée:', u.get('bio'))
print('guide fermé:', u.get('installGuideDismissed'))
"

echo "── 10. Vérification isolation stats/sessions sans cookie ───────"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/profile/stats")
echo "GET stats sans cookie (attendu 401) -> $code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/profile/export")
echo "GET export sans cookie (attendu 401) -> $code"
echo "═══ TESTS TERMINÉS ═══"
