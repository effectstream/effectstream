import React, { useState } from 'react';
import { Logo3D } from './Logo3D';
import type { useWallet } from '../hooks/useWallet';
import { BROWSER_WALLET_ID } from '../hooks/useActiveWallet';
import { truncateAddress } from '../utils';
import { api } from '../services/api';

interface HeaderProps {
  onOpenMintModal: () => void;
  wallets: string[];
  activeWallet: string;
  onWalletChange: (id: string) => void;
  wallet: ReturnType<typeof useWallet>;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMintModal, wallets, activeWallet, onWalletChange, wallet }) => {
  const { status, walletName, walletIcon, shieldedAddress, unshieldedAddress, shieldedBalances, error, connectWallet, disconnectWallet } = wallet;
  const [faucetStatus, setFaucetStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [faucetError, setFaucetError] = useState<string | null>(null);

  const handleFaucet = async () => {
    if (!unshieldedAddress) return;
    setFaucetStatus('pending');
    setFaucetError(null);
    try {
      await api.requestFaucet(unshieldedAddress);
      setFaucetStatus('idle');
    } catch (e: any) {
      setFaucetStatus('error');
      setFaucetError(e.message ?? String(e));
    }
  };

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

  const isBrowserActive = activeWallet === BROWSER_WALLET_ID;
  const walletLabel = (w: string) =>
    w === BROWSER_WALLET_ID ? (walletName ?? 'Browser') : (w.charAt(0).toUpperCase() + w.slice(1));

  return (
    <div className="header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
      <Logo3D />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px' }}>
        <h1 style={{ justifyContent: 'center', width: '100%', marginBottom: '4px' }}>
          ZSwap DA <span className="badge badge-midnight">MIDNIGHT</span><span className="badge badge-da">CELESTIA</span>
        </h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          Create token mints and swap offers, submit offers to Celestia, and track completion status from Midnight.
        </p>
      </div>

      <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
        {wallets.length > 1 && (
          <div className="wallet-selector">
            <label className="wallet-selector-label">Acting as</label>
            <div className="wallet-selector-buttons">
              {wallets.map(w => (
                <button
                  key={w}
                  className={`wallet-selector-btn ${w === activeWallet ? 'wallet-selector-btn-active' : ''}`}
                  onClick={() => onWalletChange(w)}
                  title={w === BROWSER_WALLET_ID ? 'Use the connected browser wallet (Lace) to sign' : undefined}
                >
                  {walletLabel(w)}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="mint-btn-top" onClick={onOpenMintModal}>+ Mint New Token</button>
        {isBrowserActive && unshieldedAddress && (
          <button
            className="mint-btn-top"
            style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}
            onClick={handleFaucet}
            disabled={faucetStatus === 'pending'}
            title={`Send 1000 NIGHT to ${unshieldedAddress}`}
          >
            {faucetStatus === 'pending' ? 'Sending…' : 'Request 1000 NIGHT'}
          </button>
        )}
        {faucetError && <span style={{ color: '#ef4444', fontSize: '0.7rem', textAlign: 'center' }}>{faucetError}</span>}
        {renderWalletButton()}
        {error && <span style={{ color: '#ef4444', fontSize: '0.7rem', textAlign: 'center' }}>{error}</span>}
      </div>
    </div>
  );
};
