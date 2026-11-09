import { google } from 'googleapis';

/**
 * Create an authenticated OAuth2 client using environment variables.
 */
export function getAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials not configured in environment variables');
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }

  return client;
}

/**
 * Get an authenticated Google Drive client.
 */
export function getDrive() {
  return google.drive({ version: 'v3', auth: getAuthClient() });
}

/**
 * Find or create the PersonalVault folder in Google Drive.
 * Returns the folder ID.
 */
export async function getOrCreateFolder(folderName) {
  const drive = getDrive();
  const name = (folderName || process.env.DRIVE_FOLDER_NAME || 'PersonalVault')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");

  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 10,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName || process.env.DRIVE_FOLDER_NAME || 'PersonalVault',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.data.id;
}

/**
 * Generate a unique filename if a duplicate exists in the folder
 * e.g., "report.pdf" -> "report (1).pdf"
 */
export async function getUniqueFileName(folderId, fileName) {
  const drive = getDrive();
  const escaped = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (!res.data.files || res.data.files.length === 0) {
    return fileName;
  }

  // File exists — generate numbered suffix
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
  const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : '';

  let counter = 1;
  while (counter < 100) {
    const candidate = `${base} (${counter})${ext}`;
    const candEscaped = candidate.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const check = await drive.files.list({
      q: `'${folderId}' in parents and name='${candEscaped}' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    if (!check.data.files || check.data.files.length === 0) {
      return candidate;
    }
    counter++;
  }

  // Fallback with timestamp
  return `${base}_${Date.now()}${ext}`;
}

/**
 * List all files inside a given folder.
 */
export async function listFiles(folderId) {
  const drive = getDrive();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  });

  return res.data.files || [];
}

/**
 * Upload a file to a specific folder in Google Drive.
 */
export async function uploadFile(folderId, fileName, mimeType, buffer) {
  const drive = getDrive();
  const { Readable } = await import('stream');

  // Ensure unique name to prevent accidental overwrites
  const uniqueName = await getUniqueFileName(folderId, fileName);

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: uniqueName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType,
      body: stream,
    },
    fields: 'id, name, mimeType, size, modifiedTime',
  });

  return res.data;
}

/**
 * Download a file from Google Drive.
 * Returns { metadata, stream }.
 */
export async function downloadFile(fileId) {
  const drive = getDrive();

  // Get metadata first
  const meta = await drive.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, size',
  });

  // Get file content
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return {
    metadata: meta.data,
    stream: response.data,
  };
}

/**
 * Delete a file from Google Drive (permanently).
 */
export async function deleteFile(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId: fileId });
}

/**
 * Verify that a file belongs to the PersonalVault folder.
 * Returns true if the file's parent is the given folder.
 */
export async function verifyFileInFolder(fileId, folderId) {
  const drive = getDrive();

  try {
    const res = await drive.files.get({
      fileId: fileId,
      fields: 'id, parents',
    });

    const parents = res.data.parents || [];
    return parents.includes(folderId);
  } catch (err) {
    if (err.code === 404) return false;
    throw err;
  }
}
