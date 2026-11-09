const FILE_ICONS = {
  pdf: { color: '#dc2626', label: 'PDF' },
  doc: { color: '#2563eb', label: 'DOC' },
  docx: { color: '#2563eb', label: 'DOCX' },
  xls: { color: '#059669', label: 'XLS' },
  xlsx: { color: '#059669', label: 'XLSX' },
  ppt: { color: '#d97706', label: 'PPT' },
  pptx: { color: '#d97706', label: 'PPTX' },
  jpg: { color: '#7c3aed', label: 'JPG' },
  jpeg: { color: '#7c3aed', label: 'JPEG' },
  png: { color: '#7c3aed', label: 'PNG' },
  txt: { color: '#6b7280', label: 'TXT' },
  zip: { color: '#ca8a04', label: 'ZIP' },
};

export default function DocumentItem({ file, onDelete, onDownload }) {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const icon = FILE_ICONS[ext] || { color: '#6b7280', label: ext.toUpperCase() || '?' };

  return (
    <div className="document-item">
      <div className="document-icon" style={{ backgroundColor: `${icon.color}15` }}>
        <span style={{ color: icon.color, fontWeight: 600, fontSize: '0.7rem' }}>
          {icon.label}
        </span>
      </div>

      <div className="document-info">
        <span className="document-name" title={file.name}>
          {file.name}
        </span>
        <div className="document-meta">
          <span className="document-size">{formatSize(file.size)}</span>
          <span className="document-date">{formatDate(file.modifiedTime)}</span>
        </div>
      </div>

      <div className="document-actions">
        <button
          className="btn-icon btn-download"
          onClick={() => onDownload(file)}
          title="Download"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          className="btn-icon btn-delete"
          onClick={() => onDelete(file)}
          title="Delete"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}
