import { parseCookies, verifySession, setSecurityHeaders } from './security.js';

/**
 * In-memory rate-limiting store for password attempts.
 * Maps IP -> { count, firstAttempt }
 * Max 5 attempts per IP per 15 minutes.
 */
const rateLimitMap = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Clean expired rate-limit entries periodically.
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.firstAttempt > WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}

// Cleanup interval (unref so it doesn't hold open serverless lambda processes)
const cleanupTimer = setInterval(cleanupRateLimits, 5 * 60 * 1000);
if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Check if an IP is rate-limited.
 * Returns true if the request is allowed, false if blocked.
 */
export function checkRateLimit(ip) {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Window expired — reset
  if (now - entry.firstAttempt > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Within window
  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Reset rate limit for an IP (e.g. on successful unlock).
 */
export function resetRateLimit(ip) {
  rateLimitMap.delete(ip);
}

/**
 * Authenticate a request by verifying the vault_session cookie.
 * Returns the session payload if valid.
 * Throws an error object with status and message if invalid.
 */
export function authenticate(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw { status: 500, message: 'Server configuration error: SESSION_SECRET is not configured' };
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies.vault_session;

  if (!token) {
    throw { status: 401, message: 'Authentication required' };
  }

  const session = verifySession(token, secret);
  if (!session) {
    throw { status: 401, message: 'Session expired or invalid' };
  }

  return session;
}

/**
 * Middleware wrapper: authenticates and sets security headers.
 * Returns the session or sends an error response.
 */
export function requireAuth(req, res) {
  setSecurityHeaders(res);
  try {
    return authenticate(req);
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
    return null;
  }
}

/**
 * Get client IP from request (handles Vercel proxy headers).
 */
export function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}
