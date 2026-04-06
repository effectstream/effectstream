import React from 'react';
import { Logo3D } from './Logo3D';
import { useWallet } from '../hooks/useWallet';

interface HeaderProps {
  onOpenMintModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMintModal }) => {
  const { connectWallet } = useWallet();

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
        <button className="mint-btn-top" onClick={onOpenMintModal}>+ Mint New Token</button>
        <button 
          className="mint-btn-top" 
          style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
};
