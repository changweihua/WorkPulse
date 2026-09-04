import { URL } from 'url'
import log from 'electron-log/main'

// Allowed domains for shell.openExternal.
// Subdomains are automatically included (e.g. 'docs.github.com' matches 'github.com').
// To add a new domain, simply append it to this array.
const ALLOWED_DOMAINS: readonly string[] = [
  'github.com',
  'github.io',
  'githubusercontent.com',
  'juejin.cn',
  'electronjs.org',
  'vitejs.dev',
  'vuejs.org',
  'developer.mozilla.org',
  'npmjs.com',
  'nodejs.org',
  'google.com',
  'google.com.hk',
  'www.google.com',
  'bing.com',
  'baidu.com',
  'stackoverflow.com',
  'stackexchange.com',
]

const ALLOWED_PROTOCOLS: readonly string[] = ['https:', 'http:', 'mailto:']

/**
 * Check whether a URL is allowed to be opened externally.
 *
 * Validation rules:
 * 1. Must be a parseable URL.
 * 2. Protocol must be https:, http:, or mailto:.
 * 3. Hostname must match (or be a subdomain of) an entry in ALLOWED_DOMAINS.
 *
 * @param urlString  The URL string to validate.
 * @returns `true` if the URL passes all checks, `false` otherwise.
 */
export function isUrlAllowed(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') {
    return false
  }

  try {
    const url = new URL(urlString)

    // Protocol check
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return false
    }

    // Domain whitelist check (case-insensitive, supports subdomains)
    const hostname = url.hostname.toLowerCase()
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    )
  } catch {
    // Malformed / unparseable URL
    return false
  }
}

/**
 * Safe wrapper around shell.openExternal.
 * Validates the URL against the whitelist before opening.
 * Logs a warning and returns false if the URL is blocked.
 */
export async function safeOpenExternal(
  url: string,
  shellModule: typeof import('electron').shell
): Promise<boolean> {
  if (!isUrlAllowed(url)) {
    log.warn(`[Security] Blocked openExternal for non-whitelisted URL: ${url}`)
    return false
  }
  await shellModule.openExternal(url)
  return true
}
