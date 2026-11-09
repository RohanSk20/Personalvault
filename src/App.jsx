import { useState, useEffect, useCallback } from 'react';
import LockScreen from './components/LockScreen';
import VaultHeader from './components/VaultHeader';
import Notification from './components/Notification';
import UploadArea from './components/UploadArea';
import DocumentList from './components/DocumentList';
import ConfirmDialog from './components/ConfirmDialog';
import * as api from './services/api';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Auto-dismiss notifications
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Check status on mount
  useEffect(() => {
    api
      .checkStatus()
      .then((data) => {
        setGoogleConnected(data.googleConnected);
        if (data.authenticated) {
          setIsUnlocked(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Load files when unlocked
  useEffect(() => {
    if (isUnlocked && googleConnected) {
      loadFiles();
    }
  }, [isUnlocked, googleConnected]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listFiles();
      setFiles(data.files || []);
    } catch (err) {
      notify('error', err.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  const notify = (type, message) => {
    setNotification({ type, message });
  };

  const handleUnlock = () => {
    setIsUnlocked(true);
    notify('success', 'Vault unlocked successfully');
  };

  const handleConnectDrive = () => {
    window.location.href = '/api/google/start';
  };

  const handleUploadComplete = () => {
    loadFiles();
    notify('success', 'Document uploaded successfully');
  };

  const handleDownload = async (file) => {
    try {
      notify('info', `Downloading ${file.name}...`);
      await api.downloadFile(file.id, file.name);
    } catch (err) {
      notify('error', err.message || 'Download failed');
    }
  };

  const handleDeleteClick = (file) => {
    setDeleteTarget(file);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.deleteFile(deleteTarget.id);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      notify('success', `Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (err) {
      notify('error', err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  // Filter files by search query
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Initial loading state
  if (loading && !isUnlocked) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  // Lock screen
  if (!isUnlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  // Main vault
  return (
    <div className="app">
      <VaultHeader
        googleConnected={googleConnected}
        onConnectDrive={handleConnectDrive}
      />

      <Notification
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      <main className="vault-main">
        <div className="vault-container">
          <div className="vault-title-row">
            <h1 className="vault-title">My Documents</h1>
          </div>

          {googleConnected ? (
            <>
              <UploadArea
                onUploadComplete={handleUploadComplete}
                onNotify={notify}
              />

              <div className="search-bar">
                <svg
                  className="search-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <DocumentList
                files={filteredFiles}
                loading={loading}
                onDelete={handleDeleteClick}
                onDownload={handleDownload}
              />
            </>
          ) : (
            <div className="connect-prompt">
              <div className="connect-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2>Connect Google Drive</h2>
              <p>Link your Google Drive to start storing documents in your vault.</p>
              <button className="btn btn-primary" onClick={handleConnectDrive}>
                Connect Google Drive
              </button>
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={deleteLoading}
      />
    </div>
  );
}
