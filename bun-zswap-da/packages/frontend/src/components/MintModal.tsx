import React, { useState } from 'react';
import { useContract } from '../hooks/useContract';
import { api } from '../services/api';

interface MintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMintSuccess?: () => void;
}

export const MintModal: React.FC<MintModalProps> = ({ isOpen, onClose, onMintSuccess }) => {
  const { connectContract, submitMint: contractSubmitMint } = useContract();
  
  const [mintType, setMintType] = useState<'shielded' | 'unshielded'>('shielded');
  const [domainSep, setDomainSep] = useState('');
  const [amount, setAmount] = useState('');
  const [nonce, setNonce] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  if (!isOpen) return null;

  const handleMint = async () => {
    if (!domainSep || !amount) {
      setResult({ type: 'error', message: 'Domain separator and amount are required.' });
      return;
    }

    setLoading(true);
    setResult({ type: 'success', message: 'Submitting token mint to Midnight…' });

    try {
      // Future architecture connection point
      await connectContract();
      
      const payload = mintType === 'shielded' 
        ? { domainSep, amount, nonce: nonce || '0' } 
        : { domainSep, amount };
        
      await contractSubmitMint(payload);

      // Current backend API call
      const data = await api.mintToken(mintType, payload);
      setResult({ type: 'success', message: JSON.stringify(data, null, 2) });
      
      if (onMintSuccess) onMintSuccess();
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Mint failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">Mint New Token</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Mint Type</label>
          <select 
            value={mintType} 
            onChange={(e) => setMintType(e.target.value as 'shielded' | 'unshielded')}
          >
            <option value="shielded">Shielded (mint_shielded)</option>
            <option value="unshielded">Unshielded (mint_unshielded)</option>
          </select>
        </div>
        <div className="row">
          <div>
            <label>Domain Separator (hex, 32 bytes)</label>
            <input 
              type="text" 
              placeholder="0x01 or 64-hex chars" 
              value={domainSep}
              onChange={(e) => setDomainSep(e.target.value)}
            />
          </div>
          <div style={{ maxWidth: '180px' }}>
            <label>Amount</label>
            <input 
              type="number" 
              min="1" 
              placeholder="100" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        
        {mintType === 'shielded' && (
          <div style={{ marginTop: '10px' }}>
            <label>Nonce (Uint128)</label>
            <input 
              type="text" 
              placeholder="0" 
              style={{ maxWidth: '220px' }}
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
            />
          </div>
        )}
        
        <button 
          onClick={handleMint} 
          disabled={loading}
          style={{ width: '100%', marginTop: '20px' }}
        >
          {loading ? 'Minting...' : 'Mint on Midnight'}
        </button>
        
        {result && (
          <div className="result" style={{ display: 'block', color: result.type === 'error' ? '#dc2626' : undefined }}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
};
