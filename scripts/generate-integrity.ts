/**
 * generate-integrity.ts
 *
 * Post-build script: reads the freshly built `app.asar`, computes its SHA-256
 * hash, and writes it to `dist/integrity.txt`.
 *
 * Usage (called automatically via `npm run postbuild`):
 *   npx tsx scripts/generate-integrity.ts
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const ASAR_PATH = join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar')
const OUT_DIR = join(ROOT, 'dist')
const OUT_FILE = join(OUT_DIR, 'integrity.txt')

function main(): void {
  if (!existsSync(ASAR_PATH)) {
    console.warn(`[integrity] app.asar not found at ${ASAR_PATH} — skipping`)
    process.exit(0)
  }

  const data = readFileSync(ASAR_PATH)
  const hash = createHash('sha256').update(data).digest('hex')

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, hash, 'utf-8')

  console.log(`[integrity] SHA-256 written to ${OUT_FILE}`)
  console.log(`[integrity] Hash: ${hash}`)
}

main()
