import React from 'react';
import { Logo3D } from './Logo3D';
import { useWallet } from '../hooks/useWallet';
import { truncateAddress } from '../utils';

interface HeaderProps {
  onOpenMintModal: () => void;
  wallets: string[];
  activeWallet: string;
  onWalletChange: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMintModal, wallets, activeWallet, onWalletChange }) => {
  const { status, walletName, walletIcon, shieldedAddress, shieldedBalances, error, connectWallet, disconnectWallet } = useWallet();

  const renderWalletButton = () => {
    switch (status) {
      case 'unavailable':
        return (
          <button
            className="mint-btn-top wallet-unavailable"
            disabled
            title="Install Lace or 1AM wallet extension"
          >
            No Wallet Detected
          </button>
        );

      case 'connecting':
        return (
          <button className="mint-btn-top" style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6', opacity: 0.6 }} disabled>
            Connecting...
          </button>
        );

      case 'connected':
        return (
          <div className="wallet-info">
            {walletIcon && <img className="wallet-icon" src={walletIcon} alt="" />}
            <div className="wallet-details">
              <div className="wallet-name-row">
                <span className="sse-status sse-status-connected" />
                <span className="wallet-name">{walletName}</span>
              </div>
              <span className="wallet-address" title={shieldedAddress ?? ''}>
                {shieldedAddress ? truncateAddress(shieldedAddress) : ''}
              </span>
              {shieldedBalances && Object.keys(shieldedBalances).length > 0 && (
                <span className="wallet-balance">
                  {Object.keys(shieldedBalances).length} token{Object.keys(shieldedBalances).length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              className="btn-small"
              style={{ margin: 0, padding: '4px 8px', fontSize: '0.7rem' }}
              onClick={disconnectWallet}
            >
              Disconnect
            </button>
          </div>
        );

      default: // disconnected
        return (
          <button
            className="mint-btn-top"
            style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
            onClick={connectWallet}
          >
            Connect Wallet
          </button>
        );
    }
  };

  return (
    <div className="header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
      {/* Left: 3D Logo */}
      <Logo3D />

      {/* Center: Title */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px' }}>
        <h1 style={{ justifyContent: 'center', width: '100%', marginBottom: '4px' }}>
          ZSwap DA <span className="badge badge-midnight">MIDNIGHT</span><span className="badge badge-da">CELESTIA</span>
        </h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          Create token mints and swap offers, submit offers to Celestia, and track completion status from Midnight.
        </p>
      </div>

      {/* Right: Actions */}
      <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
        {/* Backend wallet selector */}
        {wallets.length > 1 && (
          <div className="wallet-selector">
            <label className="wallet-selector-label">Acting as</label>
            <div className="wallet-selector-buttons">
              {wallets.map(w => (
                <button
                  key={w}
                  className={`wallet-selector-btn ${w === activeWallet ? 'wallet-selector-btn-active' : ''}`}
                  onClick={() => onWalletChange(w)}
                >
                  {w.charAt(0).toUpperCase() + w.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="mint-btn-top" onClick={onOpenMintModal}>+ Mint New Token</button>
        {renderWalletButton()}
        {error && <span style={{ color: '#ef4444', fontSize: '0.7rem', textAlign: 'center' }}>{error}</span>}
      </div>
    </div>
  );
};
