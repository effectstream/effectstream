import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useContract } from '../hooks/useContract';
import { api } from '../services/api';
import { Logo3D } from './Logo3D';

interface MintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMintSuccess?: () => void;
  activeWallet?: string;
}

const MAX_NAME_LENGTH = 16;

function generateDomainSep(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  return Date.now().toString();
}

const Tooltip: React.FC<{ text: string }> = ({ text }) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = React.useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    const el = iconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  };

  return (
    <span className="tooltip-wrap" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span className="tooltip-icon" ref={iconRef}>?</span>
      {pos && createPortal(
        <span
          className="tooltip-bubble"
          style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
};

export const MintModal: React.FC<MintModalProps> = ({ isOpen, onClose, onMintSuccess, activeWallet }) => {
  const { connectContract, submitMint: contractSubmitMint } = useContract();

  const [mintType, setMintType] = useState<'shielded' | 'unshielded'>('shielded');
  const [tokenName, setTokenName] = useState('');
  const [amount, setAmount] = useState('');
  const [domainSep, setDomainSep] = useState(generateDomainSep);
  const [nonce, setNonce] = useState(generateNonce);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [mintedToken, setMintedToken] = useState<any | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      setMintedToken(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_\-]/g, '')
      .slice(0, MAX_NAME_LENGTH);
    setTokenName(value);
  };

  const handleMint = async () => {
    if (!tokenName) {
      setResult({ type: 'error', message: 'Token name is required.' });
      return;
    }
    if (!amount) {
      setResult({ type: 'error', message: 'Amount is required.' });
      return;
    }
    if (!domainSep) {
      setResult({ type: 'error', message: 'Domain separator is required.' });
      return;
    }

    setLoading(true);
    setResult({ type: 'success', message: 'Submitting token mint to Midnight...' });

    try {
      await connectContract();

      const payload = mintType === 'shielded'
        ? { domainSep, amount, nonce: nonce || generateNonce(), name: tokenName }
        : { domainSep, amount, name: tokenName };

      await contractSubmitMint(payload);

      const data = await api.mintToken(mintType, payload, activeWallet);
      if (data.success === false) {
        setResult({ type: 'error', message: data.error || 'Mint failed' });
        return;
      }
      setResult(null);
      setMintedToken(data);

      // Regenerate for next mint
      setDomainSep(generateDomainSep());
      setNonce(generateNonce());

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

        <div style={{ display: loading ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 24px' }}>
          <Logo3D size={140} rotationSpeed={0.025} interactive={false} />
          <p style={{ marginTop: '24px', marginBottom: '4px', color: '#e2e8f0', fontSize: '0.95rem', textAlign: 'center' }}>
            Minting token <strong>{tokenName}</strong>
          </p>
          <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
            This may take a moment...
          </p>
        </div>

        <div style={{ display: loading ? 'none' : 'block' }}>
          {mintedToken ? (
            <div style={{ padding: '8px 0' }}>
              <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '16px' }}>Token minted successfully!</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace' }}>
                <tbody>
                  {Object.entries(mintedToken).map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{key}</td>
                      <td style={{ padding: '6px 8px', color: '#e2e8f0', wordBreak: 'break-all' }}>
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={onClose} style={{ width: '100%', marginTop: '20px' }}>
                Close
              </button>
            </div>
          ) : (
            <>
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

              <div style={{ marginBottom: '10px' }}>
                <label>Token Name</label>
                <input
                  type="text"
                  placeholder="e.g. FIZZ, BUZZ, COOL"
                  value={tokenName}
                  onChange={handleNameChange}
                  maxLength={MAX_NAME_LENGTH}
                  style={{ textTransform: 'uppercase' }}
                />
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', float: 'right', marginTop: '2px' }}>
                  {tokenName.length}/{MAX_NAME_LENGTH}
                </span>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>Amount</label>
                <input
                  type="number"
                  min="1"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label>
                  Domain Separator (hex, 32 bytes)
                  <Tooltip text="Unique identifier that determines the token type. Different separator = different token. Auto-generated for convenience." />
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="64 hex characters"
                    value={domainSep}
                    onChange={(e) => setDomainSep(e.target.value)}
                    style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setDomainSep(generateDomainSep())}
                    style={{ margin: 0, padding: '6px 10px', fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', flexShrink: 0 }}
                    title="Generate new random domain separator"
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              {mintType === 'shielded' && (
                <div style={{ marginBottom: '10px' }}>
                  <label>
                    Nonce
                    <Tooltip text="Ensures each shielded coin is unique on the UTXO set. Must be different for every mint of the same token type. Auto-generated from timestamp." />
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={nonce}
                      onChange={(e) => setNonce(e.target.value)}
                      style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setNonce(generateNonce())}
                      style={{ margin: 0, padding: '6px 10px', fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', flexShrink: 0 }}
                      title="Generate new nonce from current timestamp"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleMint}
                style={{ width: '100%', marginTop: '20px' }}
              >
                Mint on Midnight
              </button>

              {result && (
                <div className="result" style={{ display: 'block', color: result.type === 'error' ? '#dc2626' : undefined }}>
                  {result.message}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
