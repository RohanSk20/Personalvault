/**
 * PersonalVault — API service module
 * All fetch calls include credentials for cookie-based auth.
 */

const BASE = '';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

export async function checkStatus() {
  return request('/api/status');
}

export async function unlock(password) {
  return request('/api/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function listFiles() {
  return request('/api/files');
}

/**
 * Upload a file with progress tracking via XMLHttpRequest.
 * Returns a Promise; calls onProgress(percent) during upload.
 */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', `${BASE}/api/files/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true });
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.send(formData);
  });
}

/**
 * Download a file — fetches as blob and triggers browser download.
 */
export async function downloadFile(fileId, fileName) {
  const res = await fetch(`${BASE}/api/files/${fileId}/download`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function deleteFile(fileId) {
  return request(`/api/files/${fileId}`, {
    method: 'DELETE',
    headers: {},
  });
}
