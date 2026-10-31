#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Construction du ZIP « DRAX AI pour Vercel »
# 1. Copie du projet (sans node_modules/.next/données locales)
# 2. Schéma Prisma basculé en PostgreSQL (Neon)
# 3. package.json adapté à Vercel
# 4. Test de build COMPLET dans la copie (client Postgres + next build)
# 5. ZIP final → /home/z/my-project/download/drax-ai-vercel.zip
# ─────────────────────────────────────────────────────────────────────────────
set -e
SRC=/home/z/my-project
DST=/tmp/vercel-test
ZIP=/home/z/my-project/download/drax-ai-vercel.zip

echo "── 1. Copie du projet…"
rm -rf "$DST"
mkdir -p "$DST"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude dev.log \
  --exclude server.log \
  --exclude 'db/custom.db' \
  --exclude 'db/generated-images' \
  --exclude 'var/' \
  --exclude 'upload/' \
  --exclude 'agent-ctx/' \
  --exclude 'skills/' \
  --exclude '.env' \
  --exclude '.z-ai-config' \
  --exclude 'download/' \
  "$SRC/" "$DST/"

echo "── 2. Schéma Prisma → PostgreSQL…"
cp "$DST/prisma/schema.postgres.prisma" "$DST/prisma/schema.prisma"
rm "$DST/prisma/schema.postgres.prisma"

echo "── 3. package.json adapté à Vercel…"
node - <<'EOF'
const fs = require('fs')
const p = '/tmp/vercel-test/package.json'
const j = JSON.parse(fs.readFileSync(p, 'utf-8'))
j.name = 'drax-ai'
j.version = '1.0.0'
j.scripts = {
  dev: 'next dev -p 3000',
  build: 'prisma generate && node scripts/write-zai-config.mjs && next build',
  start: 'next start',
  lint: 'eslint .',
  'db:push': 'prisma db push',
  'db:generate': 'prisma generate',
}
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
console.log('   scripts:', JSON.stringify(j.scripts))
EOF

echo "── 4. Test de build Vercel (client Postgres + next build)…"
rm -rf "$DST/node_modules"
cp -al "$SRC/node_modules" "$DST/node_modules"
cd "$DST"
npx prisma generate --schema prisma/schema.prisma 2>&1 | tail -2
node scripts/write-zai-config.mjs
NODE_ENV=production npx next build 2>&1 | tail -25

echo "── 5. Création du ZIP…"
rm -rf "$DST/node_modules" "$DST/.next" "$DST/.z-ai-config"
mkdir -p /home/z/my-project/download
rm -f "$ZIP"
cd "$DST" && zip -qr "$ZIP" . -x '.DS_Store'
echo "ZIP: $(du -h "$ZIP" | cut -f1) → $ZIP"
unzip -l "$ZIP" | tail -3
