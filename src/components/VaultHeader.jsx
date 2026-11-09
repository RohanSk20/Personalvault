export default function VaultHeader({ googleConnected, onConnectDrive }) {
  return (
    <header className="vault-header">
      <div className="vault-header-inner">
        <div className="vault-header-logo">
          <svg
            width="28"
            height="28"
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
          <span className="vault-header-name">PersonalVault</span>
        </div>

        <div className="vault-header-status">
          {googleConnected ? (
            <span className="status-badge status-connected">
              <span className="status-dot status-dot-green" />
              Drive Connected
            </span>
          ) : (
            <button
              className="status-badge status-disconnected"
              onClick={onConnectDrive}
            >
              <span className="status-dot status-dot-orange" />
              Connect Drive
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
