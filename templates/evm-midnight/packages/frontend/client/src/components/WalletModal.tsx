import React from "react";
import { useWallet } from "../contexts/WalletContext.tsx";

interface WalletModalProps {
  onClose: () => void;
}

export function WalletModal({ onClose }: WalletModalProps) {
  const { connectBrowserWallet, connectLocalWallet } = useWallet();

  const handleConnect = async (connectFn: () => Promise<void>) => {
    try {
      await connectFn();
      onClose();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      // Handle error display in the modal if needed
    }
  };

  return (
    <div className="wallet-modal-overlay">
      <div className="wallet-modal-content">
        <button type="button" className="wallet-modal-close" onClick={onClose}>
          &times;
        </button>
        <h2 className="wallet-modal-title">Connect EVM Wallet</h2>
        <p className="wallet-modal-subtitle">
          Choose your preferred wallet to connect to the application.
        </p>
        <div className="wallet-options">
          <button
            type="button"
            className="wallet-option-button metamask"
            onClick={() => handleConnect(connectBrowserWallet)}
          >
            <div className="wallet-option-logo">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                alt="MetaMask"
              />
            </div>
            <div className="wallet-option-text">
              <span className="wallet-option-title">MetaMask</span>
              <span className="wallet-option-description">
                Connect using your browser wallet
              </span>
            </div>
          </button>
          <button
            type="button"
            className="wallet-option-button local-wallet"
            onClick={() => handleConnect(connectLocalWallet)}
          >
            <div className="wallet-option-logo">
              <span className="wallet-option-icon">🔧</span>
            </div>
            <div className="wallet-option-text">
              <span className="wallet-option-title">Local Hardhat Wallet</span>
              <span className="wallet-option-description">
                Connect to a local hardhat node
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
