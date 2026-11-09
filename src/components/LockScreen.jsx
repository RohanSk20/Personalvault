import { useState } from 'react';
import * as api from '../services/api';

export default function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await api.unlock(password);
      onUnlock();
    } catch (err) {
      if (err.status === 429) {
        setError('Too many attempts. Please try again in 15 minutes.');
      } else if (err.status === 401) {
        setError('Invalid password');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="lock-logo">
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="6" fill="#2c2c2c" />
            <path
              d="M8 10h4v12H8V10zm6 0h4v12h-4V10zm6 0h4v12h-4V10z"
              fill="#ffffff"
              opacity="0.9"
            />
            <rect x="7" y="8" width="18" height="2" rx="1" fill="#ffffff" />
            <rect x="7" y="22" width="18" height="2" rx="1" fill="#ffffff" />
          </svg>
        </div>

        <h1 className="lock-title">PersonalVault</h1>
        <p className="lock-subtitle">Your documents. One private place.</p>

        <form className="lock-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="password"
              className={`input ${error ? 'input-error' : ''}`}
              placeholder="Enter master password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              autoFocus
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="spinner-small" />
                Unlocking...
              </span>
            ) : (
              'Unlock Vault'
            )}
          </button>
        </form>

        <p className="lock-footer">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ verticalAlign: '-2px', marginRight: '4px' }}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Your vault is protected by a master password.
        </p>
      </div>
    </div>
  );
}
