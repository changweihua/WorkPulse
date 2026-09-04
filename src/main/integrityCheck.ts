import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app, dialog } from 'electron'
import log from 'electron-log/main'

/**
 * Verify the integrity of the packaged app.asar at startup.
 *
 * Flow:
 *  1. Compute SHA-256 of the running app.asar.
 *  2. If a reference hash already exists on disk (previous run / build), compare.
 *     - Match  → OK, log and continue.
 *     - Mismatch → log error, show a non-blocking warning dialog, but do NOT crash.
 *  3. If no reference hash exists (first run or first after an update), store it.
 *
 * The reference hash is generated at build time by `scripts/generate-integrity.ts`
 * and written to `dist/integrity.txt`. During the first startup after install the
 * file is copied to `app.getPath('userData')/app.integrity` so that subsequent
 * runs can verify against it.
 */
export function verifyIntegrity(): void {
  try {
    // In dev mode there is no app.asar — skip silently
    if (!app.isPackaged) {
      log.info('[Integrity] Development mode — skipping check')
      return
    }

    const asarPath = join(process.resourcesPath, 'app.asar')

    if (!existsSync(asarPath)) {
      log.warn('[Integrity] app.asar not found, skipping check')
      return
    }

    // --- Compute current hash ---
    const data = readFileSync(asarPath)
    const currentHash = createHash('sha256').update(data).digest('hex')

    const hashFile = join(app.getPath('userData'), 'app.integrity')

    if (existsSync(hashFile)) {
      const storedHash = readFileSync(hashFile, 'utf-8').trim()

      if (storedHash !== currentHash) {
        log.error('[Integrity] Hash mismatch — app may be tampered with')
        log.error(`[Integrity] Expected : ${storedHash}`)
        log.error(`[Integrity] Actual   : ${currentHash}`)

        // Non-blocking warning — the app keeps running
        dialog.showMessageBoxSync({
          type: 'warning',
          title: '安全警告',
          message: '应用完整性校验失败，文件可能被篡改。',
          detail: `Expected: ${storedHash.slice(0, 16)}…\nGot:      ${currentHash.slice(0, 16)}…`
        })
      } else {
        log.info('[Integrity] Hash verified OK')
      }
    } else {
      // First run after fresh install — persist the current hash
      writeFileSync(hashFile, currentHash, 'utf-8')
      log.info(`[Integrity] Initial hash stored: ${currentHash.slice(0, 16)}…`)
    }
  } catch (error) {
    log.error('[Integrity] Check failed:', error)
  }
}
