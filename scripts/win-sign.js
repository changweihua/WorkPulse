/**
 * Custom Windows signing callback for electron-builder.
 *
 * electron-builder invokes this when `win.sign` is set to a JS file path.
 * It reads the certificate from the same environment variables that
 * electron-builder's built-in signer expects, making the config self-
 * contained and explicit.
 *
 * If no certificate is available the build proceeds without signing
 * (developer machines), but in CI the prebuild check-script will warn.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * @param {string} pathToSign  Absolute path to the file to sign
 * @param {string} hash        SHA-256 hash of the file
 * @returns {Promise<void>}
 */
module.exports = async function sign(pathToSign, hash) {
  const certificateFile = process.env.WIN_CSC_LINK
  const certificatePassword = process.env.WIN_CSC_KEY_PASSWORD

  if (!certificateFile) {
    console.warn(
      `[win-sign] WIN_CSC_LINK not set – skipping code signing for ${path.basename(pathToSign)}`
    )
    return
  }

  // Resolve the certificate path (may be relative to project root)
  const resolvedCert = path.isAbsolute(certificateFile)
    ? certificateFile
    : path.resolve(process.cwd(), certificateFile)

  if (!fs.existsSync(resolvedCert)) {
    throw new Error(
      `[win-sign] Certificate file not found: ${resolvedCert}`
    )
  }

  // Ensure signtool is available via PATH or via electron-builder's bundled copy
  const signtool =
    process.env.WINDOWS_SIGNTOOL_PATH || 'signtool.exe'

  const timestampServer = process.env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com'

  const args = [
    'sign',
    '/fd', 'SHA256',
    '/tr', timestampServer,
    '/td', 'SHA256',
    '/f', resolvedCert,
  ]
  if (certificatePassword) {
    args.push('/p', certificatePassword)
  }
  args.push(pathToSign)

  console.log(`[win-sign] Signing ${path.basename(pathToSign)} ...`)
  execSync(`"${signtool}" ${args.join(' ')}`, { stdio: 'inherit' })
  console.log(`[win-sign] Done: ${path.basename(pathToSign)}`)
}
