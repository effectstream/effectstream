import React, { useState, useEffect } from 'react';
import { useContract } from '../hooks/useContract';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { api } from '../services/api';
import { MAX_TOKEN_NAME_LENGTH, TOKEN_TYPE } from '../constants';
import { Modal } from './ui/Modal';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ResultTable } from './ui/ResultTable';
import { Tooltip } from './ui/Tooltip';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

interface MintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMintSuccess?: () => void;
  activeWallet?: string;
  connectedApi?: ConnectedAPI | null;
}

function generateDomainSep(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  return Date.now().toString();
}

export const MintModal: React.FC<MintModalProps> = ({ isOpen, onClose, onMintSuccess, activeWallet, connectedApi }) => {
  const { connectContract, submitMint: contractSubmitMint } = useContract();
  const { loading, result, execute, clearResult } = useAsyncAction();

  const [mintType, setMintType] = useState<'shielded' | 'unshielded'>(TOKEN_TYPE.SHIELDED);
  const [tokenName, setTokenName] = useState('');
  const [amount, setAmount] = useState('');
  const [domainSep, setDomainSep] = useState(generateDomainSep);
  const [nonce, setNonce] = useState(generateNonce);
  const [mintedToken, setMintedToken] = useState<any | null>(null);

  useEffect(() => {
    if (!isOpen) {
      clearResult();
      setMintedToken(null);
    }
  }, [isOpen, clearResult]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_\-]/g, '')
      .slice(0, MAX_TOKEN_NAME_LENGTH);
    setTokenName(value);
  };

  const handleMint = () => {
    if (!tokenName) {
      clearResult();
      execute(async () => { throw new Error('Token name is required.'); });
      return;
    }
    if (!amount) {
      clearResult();
      execute(async () => { throw new Error('Amount is required.'); });
      return;
    }
    if (!domainSep) {
      clearResult();
      execute(async () => { throw new Error('Domain separator is required.'); });
      return;
    }

    execute(async (setMessage) => {
      setMessage('Submitting token mint to Midnight...');

      await connectContract();

      const payload = mintType === TOKEN_TYPE.SHIELDED
        ? { domainSep, amount, nonce: nonce || generateNonce(), name: tokenName }
        : { domainSep, amount, name: tokenName };

      await contractSubmitMint(payload);

      // Minting a contract-defined token requires proving the OfferFiles
      // circuits. In the browser-wallet mode this would need ZK key material
      // shipped to the client and wired through getProvingProvider — tracked
      // as a follow-up. For now, minting always goes through the backend
      // `alice` wallet, even when the UI is toggled to the browser wallet.
      const mintingWallet = connectedApi != null ? 'alice' : activeWallet;
      const data = await api.mintToken(mintType, payload, mintingWallet);
      if (data.success === false) {
        throw new Error(data.error || 'Mint failed');
      }

      setMintedToken(data);

      // Regenerate for next mint
      setDomainSep(generateDomainSep());
      setNonce(generateNonce());

      if (onMintSuccess) onMintSuccess();
    });
  };

  return (
    <Modal title="Mint New Token" isOpen={isOpen} onClose={onClose}>
      {loading && (
        <LoadingOverlay message={`Minting token ${tokenName}`} />
      )}

      <div style={{ display: loading ? 'none' : 'block' }}>
        {mintedToken ? (
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '16px' }}>Token minted successfully!</p>
            <ResultTable data={mintedToken} />
            <button onClick={onClose} style={{ width: '100%', marginTop: '20px' }}>Close</button>
          </div>
        ) : (
          <>
            <div className="form-field">
              <label>Mint Type</label>
              <select
                value={mintType}
                onChange={(e) => setMintType(e.target.value as 'shielded' | 'unshielded')}
              >
                <option value={TOKEN_TYPE.SHIELDED}>Shielded (mint_shielded)</option>
                <option value={TOKEN_TYPE.UNSHIELDED}>Unshielded (mint_unshielded)</option>
              </select>
            </div>

            <div className="form-field">
              <label>Token Name</label>
              <input
                type="text"
                placeholder="e.g. FIZZ, BUZZ, COOL"
                value={tokenName}
                onChange={handleNameChange}
                maxLength={MAX_TOKEN_NAME_LENGTH}
                style={{ textTransform: 'uppercase' }}
              />
              <span className="char-counter">{tokenName.length}/{MAX_TOKEN_NAME_LENGTH}</span>
            </div>

            <div className="form-field">
              <label>Amount</label>
              <input
                type="number"
                min="1"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>
                Domain Separator (hex, 32 bytes)
                <Tooltip text="Unique identifier that determines the token type. Different separator = different token. Auto-generated for convenience." />
              </label>
              <div className="flex-row-sm">
                <input
                  type="text"
                  placeholder="64 hex characters"
                  value={domainSep}
                  onChange={(e) => setDomainSep(e.target.value)}
                  className="input-mono"
                />
                <button
                  type="button"
                  onClick={() => setDomainSep(generateDomainSep())}
                  className="btn-ghost btn-small"
                  style={{ flexShrink: 0, fontSize: '0.75rem' }}
                  title="Generate new random domain separator"
                >
                  Regenerate
                </button>
              </div>
            </div>

            {mintType === TOKEN_TYPE.SHIELDED && (
              <div className="form-field">
                <label>
                  Nonce
                  <Tooltip text="Ensures each shielded coin is unique on the UTXO set. Must be different for every mint of the same token type. Auto-generated from timestamp." />
                </label>
                <div className="flex-row-sm">
                  <input
                    type="text"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    className="input-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNonce(generateNonce())}
                    className="btn-ghost btn-small"
                    style={{ flexShrink: 0, fontSize: '0.75rem' }}
                    title="Generate new nonce from current timestamp"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}

            <button onClick={handleMint} style={{ width: '100%', marginTop: '20px' }}>
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
    </Modal>
  );
};
