import React, { useState, useEffect } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { MAX_TOKEN_NAME_LENGTH, TOKEN_TYPE } from '../constants';
import { Modal } from './ui/Modal';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ResultTable } from './ui/ResultTable';
import { Tooltip } from './ui/Tooltip';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { useContract } from '../hooks/useContract';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface MintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMintSuccess?: () => void;
  connectedApi?: ConnectedAPI | null;
  browserContract?: ReturnType<typeof useContract> | null;
}

function generateDomainSep(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  return Date.now().toString();
}

export const MintModal: React.FC<MintModalProps> = ({ isOpen, onClose, onMintSuccess, connectedApi, browserContract }) => {
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
      const payload = mintType === TOKEN_TYPE.SHIELDED
        ? { domainSep, amount, nonce: nonce || generateNonce(), name: tokenName }
        : { domainSep, amount, name: tokenName };

      if (!connectedApi || !browserContract) {
        throw new Error('Connect a browser wallet (Lace) to mint a token.');
      }

      setMessage('Preparing browser-wallet contract client…');
      const domainSepBytes = hexToBytes(payload.domainSep);
      const amountBig = BigInt(payload.amount);

      setMessage('Building + proving Midnight transaction…');
      let data: { success: true; color: string; name: string; txHash: string };
      if (mintType === TOKEN_TYPE.SHIELDED) {
        const nonceBig = BigInt(payload.nonce ?? generateNonce());
        const res = await browserContract.mintShielded(domainSepBytes, amountBig, nonceBig, tokenName);
        data = { success: true, color: res.color, name: tokenName, txHash: res.txHash };
      } else {
        const res = await browserContract.mintUnshielded(domainSepBytes, amountBig, tokenName);
        data = { success: true, color: res.color, name: tokenName, txHash: res.txHash };
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

            <button
              onClick={handleMint}
              disabled={!connectedApi || !browserContract}
              title={!connectedApi || !browserContract ? 'Connect a browser wallet (Lace) to mint' : undefined}
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
    </Modal>
  );
};
