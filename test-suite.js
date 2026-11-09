import http from 'http';
import { timingSafeEqual, generateToken, signSession, verifySession, parseCookies, sanitizeFilename } from './api/lib/security.js';
import { checkRateLimit, resetRateLimit } from './api/lib/auth.js';
import handler from './api/[...route].js';

// Setup test environment variables
process.env.VAULT_PASSWORD = 'TestMasterPassword123!';
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google/callback';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log(' RUNNING PERSONALVAULT TEST SUITE');
  console.log('========================================\n');

  // ── TEST GROUP 1: Cryptography & Security ───────────────────────────
  console.log('── Group 1: Cryptography & Security Utilities ──');

  assert(timingSafeEqual('mypassword', 'mypassword') === true, 'timingSafeEqual returns true for identical strings');
  assert(timingSafeEqual('mypassword', 'wrongpass') === false, 'timingSafeEqual returns false for different lengths');
  assert(timingSafeEqual('mypassword1', 'mypassword2') === false, 'timingSafeEqual returns false for same length different chars');
  assert(timingSafeEqual(null, 'test') === false, 'timingSafeEqual handles null safely');

  const token1 = generateToken(32);
  const token2 = generateToken(32);
  assert(token1.length === 64, 'generateToken(32) produces 64-char hex string');
  assert(token1 !== token2, 'generateToken generates cryptographically random tokens');

  const sessionToken = signSession({ user: 'owner' }, process.env.SESSION_SECRET);
  assert(typeof sessionToken === 'string' && sessionToken.includes('.'), 'signSession produces HMAC signed token');

  const verified = verifySession(sessionToken, process.env.SESSION_SECRET);
  assert(verified !== null && verified.user === 'owner', 'verifySession successfully verifies authentic token');

  const tamperedToken = sessionToken.slice(0, -4) + 'abcd';
  assert(verifySession(tamperedToken, process.env.SESSION_SECRET) === null, 'verifySession rejects tampered signature');

  const wrongSecret = verifySession(sessionToken, 'different-secret-key-that-does-not-match-at-all-123456');
  assert(wrongSecret === null, 'verifySession rejects token verified with wrong secret');

  const expiredToken = signSession({ user: 'owner' }, process.env.SESSION_SECRET, -1000);
  assert(verifySession(expiredToken, process.env.SESSION_SECRET) === null, 'verifySession rejects expired token');

  const parsedCookies = parseCookies('vault_session=token123; other=hello');
  assert(parsedCookies.vault_session === 'token123' && parsedCookies.other === 'hello', 'parseCookies parses cookie string correctly');

  assert(sanitizeFilename('../../etc/passwd') === 'passwd', 'sanitizeFilename strips directory traversal');
  assert(sanitizeFilename('important document (1).pdf') === 'important document (1).pdf', 'sanitizeFilename preserves safe names');
  assert(sanitizeFilename('file<script>alert(1)</script>.png').includes('file_script_alert'), 'sanitizeFilename escapes unsafe characters');

  // ── TEST GROUP 2: Rate Limiting ────────────────────────────────────
  console.log('\n── Group 2: Rate Limiting & Brute-Force Protection ──');
  const testIP = '192.168.1.100';
  resetRateLimit(testIP);

  assert(checkRateLimit(testIP) === true, 'Attempt 1 allowed');
  assert(checkRateLimit(testIP) === true, 'Attempt 2 allowed');
  assert(checkRateLimit(testIP) === true, 'Attempt 3 allowed');
  assert(checkRateLimit(testIP) === true, 'Attempt 4 allowed');
  assert(checkRateLimit(testIP) === true, 'Attempt 5 allowed');
  assert(checkRateLimit(testIP) === false, 'Attempt 6 blocked by rate limiter (429)');
  resetRateLimit(testIP);
  assert(checkRateLimit(testIP) === true, 'Rate limit reset restores access');
  resetRateLimit(testIP);

  // ── TEST GROUP 3: Serverless API Endpoints ─────────────────────────
  console.log('\n── Group 3: Serverless API Endpoints Integration ──');

  const server = http.createServer((req, res) => {
    handler(req, res);
  });

  await new Promise((resolve) => server.listen(3099, '127.0.0.1', resolve));

  try {
    // Test 3.1: GET /api/status (unauthenticated)
    const statusRes = await fetch('http://127.0.0.1:3099/api/status');
    const statusData = await statusRes.json();
    assert(statusRes.status === 200, 'GET /api/status responds with 200 OK');
    assert(statusData.ok === true, 'GET /api/status returns ok: true');
    assert(statusData.authenticated === false, 'GET /api/status reports unauthenticated when no session');
    assert(typeof statusData.googleConnected === 'boolean', 'GET /api/status reports googleConnected boolean');

    // Test 3.2: POST /api/unlock with wrong password
    const failUnlockRes = await fetch('http://127.0.0.1:3099/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
      body: JSON.stringify({ password: 'WrongPassword!' }),
    });
    assert(failUnlockRes.status === 401, 'POST /api/unlock rejects incorrect password with 401');

    // Test 3.3: POST /api/unlock with correct password
    const successUnlockRes = await fetch('http://127.0.0.1:3099/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.2' },
      body: JSON.stringify({ password: 'TestMasterPassword123!' }),
    });
    assert(successUnlockRes.status === 200, 'POST /api/unlock accepts valid password with 200 OK');
    const setCookie = successUnlockRes.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('vault_session='), 'POST /api/unlock sets vault_session HTTP-only cookie');
    assert(setCookie.includes('HttpOnly'), 'vault_session cookie has HttpOnly flag');
    assert(setCookie.includes('SameSite=Lax'), 'vault_session cookie has SameSite=Lax');

    // Extract cookie for authenticated requests
    const cookieVal = setCookie.split(';')[0];

    // Test 3.4: GET /api/status (authenticated)
    const authStatusRes = await fetch('http://127.0.0.1:3099/api/status', {
      headers: { Cookie: cookieVal },
    });
    const authStatusData = await authStatusRes.json();
    assert(authStatusData.authenticated === true, 'GET /api/status returns authenticated: true with session cookie');

    // Test 3.5: GET /api/files without session
    const unauthFilesRes = await fetch('http://127.0.0.1:3099/api/files');
    assert(unauthFilesRes.status === 401, 'GET /api/files blocks unauthenticated request with 401');

    // Test 3.6: GET /api/google/start (starts OAuth flow)
    const oauthStartRes = await fetch('http://127.0.0.1:3099/api/google/start', {
      headers: { Cookie: cookieVal },
      redirect: 'manual',
    });
    assert(oauthStartRes.status === 302, 'GET /api/google/start responds with 302 redirect');
    const location = oauthStartRes.headers.get('location');
    assert(location && location.includes('accounts.google.com'), 'OAuth redirect points to Google OAuth');
    assert(location.includes('drive.file'), 'OAuth request specifies minimum scope drive.file');
    assert(location.includes('access_type=offline'), 'OAuth request requests offline access for refresh token');
    const oauthCookie = oauthStartRes.headers.get('set-cookie');
    assert(oauthCookie && oauthCookie.includes('oauth_state='), 'OAuth flow generates and sets signed oauth_state CSRF cookie');

    // Test 3.7: GET /api/google/callback with CSRF attack (invalid state)
    const callbackCsrfRes = await fetch('http://127.0.0.1:3099/api/google/callback?code=mock_code&state=fake_state', {
      headers: { Cookie: `${cookieVal}; oauth_state=invalid_token` },
    });
    assert(callbackCsrfRes.status === 400, 'GET /api/google/callback rejects state mismatch with 400');

    // Test 3.8: 404 for unknown endpoint
    const notFoundRes = await fetch('http://127.0.0.1:3099/api/nonexistent', {
      headers: { Cookie: cookieVal },
    });
    assert(notFoundRes.status === 404, 'Unknown API route returns 404');

    // Test 3.9: Security Headers verification
    const secHeaders = statusRes.headers;
    assert(secHeaders.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff header present');
    assert(secHeaders.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY header present');

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n========================================');
  console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
