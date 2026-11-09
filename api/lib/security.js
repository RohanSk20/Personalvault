import crypto from 'crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate a cryptographically secure random hex token.
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Sign a payload with HMAC-SHA256. Returns a base64url token containing
 * the JSON payload + expiry + signature.
 */
export function signSession(payload, secret, maxAgeMs = 8 * 60 * 60 * 1000) {
  const data = {
    ...payload,
    exp: Date.now() + maxAgeMs,
  };
  const json = JSON.stringify(data);
  const encoded = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a signed session token.
 * Returns the payload object or null if invalid/expired.
 */
export function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  if (!timingSafeEqual(sig, expectedSig)) return null;

  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const data = JSON.parse(json);
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Parse a Cookie header string into an object.
 */
export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

/**
 * Set the vault session cookie on a response.
 */
export function setSessionCookie(res, token, maxAge = 8 * 60 * 60) {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production';
  const cookie = [
    `vault_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Clear the vault session cookie.
 */
export function clearSessionCookie(res) {
  const cookie = [
    'vault_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

/**
 * Sanitize a filename: extract base name, strip directory traversal, limit length, escape unsafe chars.
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unnamed';
  // Strip path traversal prefixes (../ or ..\ repeatedly)
  let safe = name.replace(/^(\.\.[/\\])+/, '');
  // Extract file name from path if standard path separator exists
  const lastSlash = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'));
  if (lastSlash !== -1 && !safe.includes('</')) {
    safe = safe.slice(lastSlash + 1);
  } else if (lastSlash !== -1) {
    safe = safe.replace(/[/\\]/g, '_');
  }
  // Strip any remaining dangerous characters
  safe = safe.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
  safe = safe.replace(/_+/g, '_');
  safe = safe.replace(/^[._]+|[._]+$/g, '');
  safe = safe.trim().substring(0, 200);
  return safe || 'unnamed';
}

/**
 * Set common security headers on a response.
 */
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
