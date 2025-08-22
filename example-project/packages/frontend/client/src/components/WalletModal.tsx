import type React from "react";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectLocal: () => void;
  onConnectBrowser: () => void;
}

export function WalletModal(
  { isOpen, onClose, onConnectLocal, onConnectBrowser }: WalletModalProps,
) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="wallet-modal-overlay" onClick={onClose}>
      <div
        className="wallet-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Connect Wallet</h2>
        <p>Choose a wallet to connect with.</p>
        <div className="wallet-options">
          <button
            type="button"
            onClick={onConnectLocal}
            className="wallet-button"
          >
            Create Local Wallet
          </button>
          <button
            type="button"
            onClick={onConnectBrowser}
            className="wallet-button"
          >
            Connect Browser Wallet (e.g., Metamask)
          </button>
        </div>
        <div className="wallet-suggestion">
          <p>
            For testing purposes, you can import a pre-funded wallet into
            MetaMask using the following private key:
          </p>
          <code>
            0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356
          </code>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="wallet-button"
        >
          Close
        </button>
      </div>
      <style>
        {`
        .wallet-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .wallet-modal-content {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          text-align: center;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .wallet-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin: 2rem 0;
        }
        .wallet-button {
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          background: linear-gradient(45deg, #3b82f6, #2563eb);
          color: white;
        }
        .wallet-button:hover {
          background: linear-gradient(45deg, #2563eb, #1d4ed8);
          transform: translateY(-2px);
        }
        .wallet-button:disabled {
          background: #ccc;
          cursor: not-allowed;
          transform: none;
        }
        .wallet-suggestion {
          margin-top: 1.5rem;
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f9f9f9;
        }
        .wallet-suggestion p {
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
          color: #333;
        }
        .wallet-suggestion code {
          display: block;
          padding: 0.5rem;
          background-color: #eee;
          border-radius: 4px;
          font-family: monospace;
          word-break: break-all;
        }
      `}
      </style>
    </div>
  );
}
