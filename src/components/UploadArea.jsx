import { useState, useRef } from 'react';
import { uploadFile } from '../services/api';

const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'txt', 'zip',
];
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB

export default function UploadArea({ onUploadComplete, onNotify }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type .${ext || 'unknown'} is not allowed.`;
    }
    if (file.size > MAX_SIZE) {
      return `File size (${formatSize(file.size)}) exceeds the 4 MB limit.`;
    }
    return null;
  };

  const handleUpload = async (file) => {
    const error = validateFile(file);
    if (error) {
      onNotify('error', error);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      await uploadFile(file, (pct) => setProgress(pct));
      onUploadComplete();
    } catch (err) {
      onNotify('error', err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  return (
    <div className="upload-section">
      <div
        className={`upload-area ${dragging ? 'upload-area-active' : ''} ${uploading ? 'upload-area-uploading' : ''}`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="upload-input"
          accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onChange={handleFileSelect}
          disabled={uploading}
        />

        {uploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="upload-progress-text">Uploading... {progress}%</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="upload-text">
              Drag & drop files here or <span className="upload-link">click to browse</span>
            </p>
            <p className="upload-hint">
              PDF, DOC, XLS, PPT, Images, TXT, ZIP — Max 4 MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
