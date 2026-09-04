/**
 * Log Sanitizer — masks sensitive fields before they reach electron-log output.
 *
 * Two layers of protection:
 * 1. Pattern-based: regex replaces tokens/keys that appear inline in log strings.
 * 2. Object-level: known sensitive field names are masked in structured log data.
 */

// ── Pattern-based redaction for inline sensitive data ────────────────────────

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens: Bearer <token>
  { pattern: /(Bearer\s+)([A-Za-z0-9._-]{8,})/gi, replacement: '$1***REDACTED***' },
  // Authorization header values: Authorization: <value> or "authorization": "<value>"
  { pattern: /(authorization['"]?\s*[:=]\s*['"]?)([^'"}\s,;]+)/gi, replacement: '$1***REDACTED***' },
  // API keys / tokens / passwords assigned via = or : (key=value or key:value)
  { pattern: /(api[_-]?key|apikey|token|password|passwd|secret|access_token|refresh_token|private_key|bark_key)\s*[=:]\s*['"]?([^\s'"',;}\])]+)/gi, replacement: '$1=***REDACTED***' },
  // JWT tokens (eyJ....)
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '***JWT_REDACTED***' },
  // Hex-encoded API keys that look like long random strings (32+ hex chars)
  { pattern: /\b([a-f0-9]{32,})\b/gi, replacement: '***REDACTED***' },
];

// ── Object-level field masking ──────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'api_key', 'apikey', 'apiKey', 'Api-Key',
  'token', 'access_token', 'refresh_token',
  'password', 'passwd',
  'secret', 'client_secret',
  'authorization', 'Authorization',
  'bearer', 'Bearer',
  'bark_key', 'barkKey', 'BARK_KEY',
  'private_key', 'privateKey',
  'device_key',
  'x-api-key',
]);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Sanitize a log message string by redacting inline sensitive patterns.
 * Safe to call with any string — returns the same string if no patterns match.
 */
export function sanitizeLogMessage(message: string): string {
  let sanitized = message
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global regexes reused across calls
    pattern.lastIndex = 0
    sanitized = sanitized.replace(pattern, replacement)
  }
  return sanitized
}

/**
 * Sanitize an object's string values by applying pattern-based redaction,
 * and mask values for known sensitive field names entirely.
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      // Completely mask known sensitive fields
      result[key] = typeof value === 'string' ? '***REDACTED***' : '[REDACTED]'
    } else if (typeof value === 'string') {
      result[key] = sanitizeLogMessage(value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Process an electron-log message, sanitizing both text and variables.
 * Designed to be used as a `log.transports.*.processor`.
 *
 * electron-log v5 processor signature: (message: LogMessage) => LogMessage
 * LogMessage has: { date, level, variables, text }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSanitizingProcessor(originalProcessor?: (msg: any) => any): (msg: any) => any {
  return (message: { date: Date; level: string; variables: unknown[]; text: string }) => {
    // Sanitize the text portion
    if (typeof message.text === 'string') {
      message.text = sanitizeLogMessage(message.text)
    }

    // Sanitize structured variables (objects passed as extra args to log calls)
    if (Array.isArray(message.variables)) {
      message.variables = message.variables.map((v) => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          return sanitizeObject(v as Record<string, unknown>)
        }
        if (typeof v === 'string') {
          return sanitizeLogMessage(v)
        }
        return v
      })
    }

    // Chain to original processor if one was already set
    if (typeof originalProcessor === 'function') {
      return originalProcessor(message)
    }

    return message
  }
}
