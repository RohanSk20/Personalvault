import Busboy from 'busboy';
import {
  timingSafeEqual,
  generateToken,
  signSession,
  verifySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  sanitizeFilename,
  setSecurityHeaders,
} from './lib/security.js';
import { checkRateLimit, resetRateLimit, getClientIP } from './lib/auth.js';
import {
  getOrCreateFolder,
  listFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  verifyFileInFolder,
} from './lib/googleDrive.js';
import { getAuthUrl, exchangeCode } from './lib/oauth.js';

// Disable Vercel's automatic body parser so we can stream file uploads through busboy
export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'txt', 'zip',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

/**
 * Main catch-all API handler for PersonalVault.
 */
export default async function handler(req, res) {
  setSecurityHeaders(res);

  // Normalize path (handles both /api/... and /...)
  const parsedUrl = new URL(req.url, 'http://localhost');
  let pathname = parsedUrl.pathname.replace(/^\/api/, '');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  // Remove trailing slash if not root
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const method = (req.method || 'GET').toUpperCase();

  try {
    // ── 1. GET /api/status ────────────────────────────────────────────
    if (pathname === '/status' && method === 'GET') {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies.vault_session;
      let authenticated = false;

      if (token && process.env.SESSION_SECRET) {
        const session = verifySession(token, process.env.SESSION_SECRET);
        authenticated = !!session;
      }

      const googleConnected = !!(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REFRESH_TOKEN
      );

      return sendJson(res, 200, {
        ok: true,
        authenticated,
        googleConnected,
        timestamp: new Date().toISOString(),
      });
    }

    // ── 2. POST /api/unlock ───────────────────────────────────────────
    if (pathname === '/unlock' && method === 'POST') {
      const ip = getClientIP(req);

      if (!checkRateLimit(ip)) {
        return sendJson(res, 429, {
          error: 'Too many attempts. Please try again in 15 minutes.',
        });
      }

      const body = await parseJsonBody(req);
      const { password } = body || {};

      if (!password || typeof password !== 'string') {
        return sendJson(res, 400, { error: 'Password is required' });
      }

      const vaultPassword = process.env.VAULT_PASSWORD;
      const sessionSecret = process.env.SESSION_SECRET;

      if (!vaultPassword || !sessionSecret) {
        return sendJson(res, 500, {
          error: 'Server configuration error: VAULT_PASSWORD or SESSION_SECRET missing',
        });
      }

      if (!timingSafeEqual(password, vaultPassword)) {
        return sendJson(res, 401, { error: 'Invalid password' });
      }

      // Password is correct — reset rate limit and issue signed session cookie
      resetRateLimit(ip);
      const token = signSession({ role: 'vault_owner' }, sessionSecret);
      setSessionCookie(res, token);

      return sendJson(res, 200, { success: true });
    }

    // ── Authentication Check for all protected routes ─────────────────
    const session = getSessionOrNull(req);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }

    // ── 3. GET /api/google/start ──────────────────────────────────────
    if (pathname === '/google/start' && method === 'GET') {
      const state = generateToken(24);
      const stateToken = signSession(
        { state },
        process.env.SESSION_SECRET,
        10 * 60 * 1000 // 10 minutes
      );

      const isProduction =
        process.env.NODE_ENV === 'production' ||
        process.env.VERCEL_ENV === 'production';

      const stateCookie = [
        `oauth_state=${encodeURIComponent(stateToken)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=600',
        isProduction ? 'Secure' : '',
      ]
        .filter(Boolean)
        .join('; ');

      const existing = res.getHeader('Set-Cookie');
      const cookieList = existing
        ? [].concat(existing, stateCookie)
        : [stateCookie];
      res.setHeader('Set-Cookie', cookieList);

      const authUrl = getAuthUrl(state);
      res.writeHead(302, { Location: authUrl });
      return res.end();
    }

    // ── 4. GET /api/google/callback ───────────────────────────────────
    if (pathname === '/google/callback' && method === 'GET') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const oauthError = parsedUrl.searchParams.get('error');

      // Clear the oauth_state cookie
      const clearStateCookie = 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
      const existing = res.getHeader('Set-Cookie');
      res.setHeader(
        'Set-Cookie',
        existing ? [].concat(existing, clearStateCookie) : [clearStateCookie]
      );

      if (oauthError) {
        return sendHtmlPage(
          res,
          400,
          'Authorization Denied',
          `<p>Google authorization was denied or failed: <code>${escapeHtml(oauthError)}</code></p>`,
          true
        );
      }

      if (!code || !state) {
        return sendHtmlPage(
          res,
          400,
          'Invalid Request',
          '<p>Missing code or state parameter from Google OAuth callback.</p>',
          true
        );
      }

      const cookies = parseCookies(req.headers.cookie || '');
      const stateToken = cookies.oauth_state;

      if (!stateToken) {
        return sendHtmlPage(
          res,
          400,
          'Validation Error',
          '<p>OAuth state cookie was not found. Please restart the authorization process.</p>',
          true
        );
      }

      const statePayload = verifySession(stateToken, process.env.SESSION_SECRET);
      if (!statePayload || !timingSafeEqual(statePayload.state, state)) {
        return sendHtmlPage(
          res,
          400,
          'Security Verification Failed',
          '<p>OAuth state parameter mismatch (possible CSRF attempt). Request rejected.</p>',
          true
        );
      }

      const tokens = await exchangeCode(code);
      const refreshToken = tokens.refresh_token;

      if (refreshToken) {
        return sendHtmlPage(
          res,
          200,
          'Google Drive Connected Successfully',
          `<p>Your Google Drive has been authorized for PersonalVault.</p>
           <p style="margin-top:1.25rem;font-weight:600;font-size:0.95rem;">Your Refresh Token:</p>
           <textarea readonly id="tokenBox" style="width:100%;height:100px;font-family:monospace;font-size:0.85rem;padding:0.75rem;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;margin-top:0.5rem;box-sizing:border-box;">${escapeHtml(refreshToken)}</textarea>
           <div style="margin-top:0.75rem;">
             <button onclick="navigator.clipboard.writeText(document.getElementById('tokenBox').value);this.innerText='Copied to Clipboard!';" style="background:#2c2c2c;color:#fff;border:none;padding:0.6rem 1.2rem;border-radius:6px;cursor:pointer;font-weight:500;">
               Copy Refresh Token
             </button>
           </div>
           <div style="margin-top:1.25rem;background:#f3f4f6;padding:1rem;border-radius:8px;font-size:0.88rem;color:#4b5563;line-height:1.5;">
             <strong>Next step:</strong> Add this value as <code>GOOGLE_REFRESH_TOKEN</code> in your Vercel Project Settings &rarr; Environment Variables, then redeploy.
           </div>`,
          false
        );
      } else {
        return sendHtmlPage(
          res,
          200,
          'Authorization Notice',
          `<p>Google authorized access, but did not return a new refresh token.</p>
           <p style="margin-top:0.75rem;color:#6b7280;font-size:0.9rem;">
             This occurs when PersonalVault was previously authorized. To generate a new refresh token, visit
             <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account Permissions</a>,
             revoke access for PersonalVault, and connect again.
           </p>`,
          false
        );
      }
    }

    // ── 5. GET /api/files ─────────────────────────────────────────────
    if (pathname === '/files' && method === 'GET') {
      const folderId = await getOrCreateFolder();
      const files = await listFiles(folderId);

      return sendJson(res, 200, {
        files: files.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : 0,
          modifiedTime: f.modifiedTime,
        })),
      });
    }

    // ── 6. POST /api/files/upload ─────────────────────────────────────
    if (pathname === '/files/upload' && method === 'POST') {
      const { fileName, mimeType, buffer } = await parseMultipartUpload(req);

      // Validate file extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        return sendJson(res, 400, {
          error: `File type .${ext || 'unknown'} is not allowed. Supported formats: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        });
      }

      // Validate MIME type
      if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
        return sendJson(res, 400, { error: 'Unsupported file MIME type' });
      }

      // Validate size limit (4MB)
      if (buffer.length > MAX_FILE_SIZE) {
        return sendJson(res, 413, { error: 'File size exceeds the 4 MB limit' });
      }

      const safeName = sanitizeFilename(fileName);
      const folderId = await getOrCreateFolder();
      const uploaded = await uploadFile(folderId, safeName, mimeType, buffer);

      return sendJson(res, 200, {
        success: true,
        file: {
          id: uploaded.id,
          name: uploaded.name,
          mimeType: uploaded.mimeType,
          size: uploaded.size ? parseInt(uploaded.size, 10) : buffer.length,
          modifiedTime: uploaded.modifiedTime,
        },
      });
    }

    // ── 7. GET /api/files/:id/download ────────────────────────────────
    const downloadMatch = pathname.match(/^\/files\/([^/]+)\/download$/);
    if (downloadMatch && method === 'GET') {
      const fileId = decodeURIComponent(downloadMatch[1]);
      const folderId = await getOrCreateFolder();
      const isOwned = await verifyFileInFolder(fileId, folderId);

      if (!isOwned) {
        return sendJson(res, 404, { error: 'File not found in PersonalVault' });
      }

      const { metadata, stream } = await downloadFile(fileId);
      const safeName = metadata.name || 'document';
      const cleanHeaderName = safeName.replace(/[\r\n"]/g, '_');

      res.statusCode = 200;
      res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${cleanHeaderName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
      );
      if (metadata.size) {
        res.setHeader('Content-Length', metadata.size);
      }

      return stream.pipe(res);
    }

    // ── 8. DELETE /api/files/:id ──────────────────────────────────────
    const deleteMatch = pathname.match(/^\/files\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const fileId = decodeURIComponent(deleteMatch[1]);
      const folderId = await getOrCreateFolder();
      const isOwned = await verifyFileInFolder(fileId, folderId);

      if (!isOwned) {
        return sendJson(res, 404, { error: 'File not found in PersonalVault' });
      }

      await deleteFile(fileId);
      return sendJson(res, 200, { success: true });
    }

    // ── 404 Not Found ─────────────────────────────────────────────────
    return sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
  } catch (err) {
    console.error('PersonalVault API error:', err?.message || err);
    const status = err.statusCode || (err.code === 404 ? 404 : err.code === 401 ? 401 : 500);
    return sendJson(res, status, {
      error: err.message || 'An unexpected error occurred. Please check server logs.',
    });
  }
}

// ── Helper Utilities ────────────────────────────────────────────────

function getSessionOrNull(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.vault_session;
  if (!token) return null;
  return verifySession(token, secret);
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 100 * 1024) {
        // Limit JSON body to 100KB
        reject(new Error('Request payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        resolve(str ? JSON.parse(str) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE,
          files: 1,
        },
      });
    } catch (err) {
      return reject({ statusCode: 400, message: 'Invalid multipart upload headers' });
    }

    let fileData = null;
    let limitExceeded = false;

    busboy.on('file', (fieldName, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let total = 0;

      stream.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_FILE_SIZE) {
          limitExceeded = true;
          stream.destroy();
          return reject({
            statusCode: 413,
            message: 'File size exceeds the 4 MB limit',
          });
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (!limitExceeded) {
          fileData = {
            fileName: filename || 'unnamed_file',
            mimeType: mimeType || 'application/octet-stream',
            buffer: Buffer.concat(chunks),
          };
        }
      });
    });

    busboy.on('finish', () => {
      if (limitExceeded) return;
      if (!fileData || !fileData.buffer.length) {
        return reject({ statusCode: 400, message: 'No file provided in upload' });
      }
      resolve(fileData);
    });

    busboy.on('error', (err) => {
      reject({ statusCode: 500, message: 'Multipart parsing error: ' + err.message });
    });

    req.pipe(busboy);
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendHtmlPage(res, status, title, content, isError) {
  const accentColor = isError ? '#dc2626' : '#059669';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — PersonalVault</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 2.25rem;
      max-width: 520px;
      width: 100%;
    }
    h1 {
      font-size: 1.3rem;
      color: ${accentColor};
      margin-bottom: 1rem;
      font-weight: 700;
    }
    p { color: #374151; line-height: 1.6; font-size: 0.95rem; }
    code {
      background: #f3f4f6;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85rem;
      font-family: monospace;
    }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .back-btn {
      display: inline-block;
      margin-top: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
    }
    .back-btn:hover { color: #111827; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    ${content}
    <a class="back-btn" href="/">&larr; Return to PersonalVault</a>
  </div>
</body>
</html>`;

  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}
