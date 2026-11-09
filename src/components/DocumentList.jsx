import DocumentItem from './DocumentItem';

export default function DocumentList({ files, loading, onDelete, onDownload }) {
  if (loading) {
    return (
      <div className="document-list-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-row">
            <div className="skeleton skeleton-icon" />
            <div className="skeleton-content">
              <div className="skeleton skeleton-name" />
              <div className="skeleton skeleton-meta" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d1d5db"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <h3 className="empty-title">No documents yet</h3>
        <p className="empty-text">Upload your first document to get started.</p>
      </div>
    );
  }

  return (
    <div className="document-list">
      {files.map((file) => (
        <DocumentItem
          key={file.id}
          file={file}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
