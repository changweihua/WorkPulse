/**
 * Prebuild signing validation script.
 *
 * Checks that required code-signing environment variables are set before
 * release / distribution builds.  The script is intentionally non-blocking:
 * it emits warnings rather than exiting with an error, because most
 * developer machines will not have signing certificates installed.
 *
 * Exit codes:
 *   0 – all checks passed (or warnings emitted)
 */

import { execSync } from 'child_process'

const isCI = process.env.CI === 'true'
const isRelease =
  process.argv.includes('--release') || process.env.RELEASE_BUILD === 'true'

// ── macOS ──────────────────────────────────────────────────────────────────────
const macCertName = process.env.CSC_NAME || process.env.CSC_LINK
if (isCI || isRelease) {
  if (!macCertName) {
    console.warn(
      '⚠️  macOS signing certificate not configured. ' +
        'Set CSC_NAME or CSC_LINK environment variable for release builds.'
    )
  } else {
    console.log(`✅ macOS signing certificate: ${macCertName}`)
  }
} else {
  console.log(
    'ℹ️  Skipping macOS signing check (local build, identity: null is expected)'
  )
}

// ── Windows ────────────────────────────────────────────────────────────────────
const winCertPath = process.env.WIN_CSC_LINK
const winCertPass = process.env.WIN_CSC_KEY_PASSWORD
if (isCI || isRelease) {
  if (!winCertPath) {
    console.warn(
      '⚠️  Windows signing certificate not configured. ' +
        'Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD environment variables for release builds.'
    )
  } else if (!winCertPass) {
    console.warn(
      '⚠️  WIN_CSC_LINK is set but WIN_CSC_KEY_PASSWORD is missing.'
    )
  } else {
    console.log('✅ Windows signing certificate configured.')
  }
} else {
  console.log('ℹ️  Skipping Windows signing check (local build)')
}

// ── Notarisation (macOS) ──────────────────────────────────────────────────────
if (isCI || isRelease) {
  const appleId = process.env.APPLE_ID
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  if (!appleId || !applePassword) {
    console.warn(
      '⚠️  Apple notarisation credentials not configured. ' +
        'Set APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD for notarised release builds.'
    )
  } else {
    console.log('✅ Apple notarisation credentials configured.')
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('')
console.log('Sign-check complete. Warnings above do not block the build.')
