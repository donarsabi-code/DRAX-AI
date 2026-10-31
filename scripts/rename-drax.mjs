#!/usr/bin/env node
/**
 * Renommage Lumen → DRAX AI (marque visible uniquement).
 * - Remplacement sensible à la casse de « Lumen » → « DRAX AI »
 * - Les identifiants techniques en minuscules (lumen_session, lumen-image-1,
 *   lumen-blink, lumen-otp-v1, lumen_oauth_state_) restent inchangés.
 * - L'icône est renommée en drax-icon.svg (référence mise à jour).
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync(
  `rg -l "Lumen" src/ README-REA.md .env.example 2>/dev/null || true`,
  { encoding: 'utf8', cwd: '/home/z/my-project' },
)
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)

let total = 0
for (const file of files) {
  const path = `/home/z/my-project/${file}`
  const before = readFileSync(path, 'utf8')
  const after = before.replaceAll('Lumen', 'DRAX AI')
  const n = before.split('Lumen').length - 1
  if (n > 0) {
    writeFileSync(path, after)
    total += n
    console.log(`${file}: ${n} remplacement(s)`)
  }
}

// Icône : renommage physique + mise à jour de la référence
const oldIcon = '/home/z/my-project/public/lumen-icon.svg'
const newIcon = '/home/z/my-project/public/drax-icon.svg'
if (existsSync(oldIcon)) {
  renameSync(oldIcon, newIcon)
  console.log('icône renommée : lumen-icon.svg → drax-icon.svg')
}
const layoutPath = '/home/z/my-project/src/app/layout.tsx'
const layout = readFileSync(layoutPath, 'utf8')
if (layout.includes('lumen-icon.svg')) {
  writeFileSync(layoutPath, layout.replaceAll('lumen-icon.svg', 'drax-icon.svg'))
  console.log('référence icône mise à jour dans layout.tsx')
}

console.log(`TOTAL: ${total} remplacements dans ${files.length} fichiers`)
