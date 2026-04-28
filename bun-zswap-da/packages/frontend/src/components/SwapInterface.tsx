import React, { useState } from 'react';
import { TokenInput } from './TokenInput';
import type { KnownToken, TokenEntry } from '../types';
import { api } from '../services/api';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { TOKEN_TYPE } from '../constants';
import { encodeOffer } from 'mip-zswap-offer';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { detectOfferProofState } from '../services/browserContract';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// The wallet's makeIntent/balance methods return an opaque serialized
// transaction string. The connector spec doesn't fix the encoding, but
// midnight-js and Lace use hex. Fall back to base64 if the string doesn't
// look like hex.
function decodeConnectorTx(tx: string): Uint8Array {
  const isHex = /^(0x)?[0-9a-fA-F]+$/.test(tx) && tx.replace(/^0x/, '').length % 2 === 0;
  if (isHex) return hexToBytes(tx);
  return base64ToBytes(tx);
}

interface SwapInterfaceProps {
  knownTokens: KnownToken[];
  onSuccess: () => void;
  activeWallet?: string;
  connectedApi?: ConnectedAPI | null;
  browserShieldedAddress?: string | null;
  browserUnshieldedAddress?: string | null;
  browserNetworkId?: string | null;
}

const emptyEntry = (): TokenEntry => ({ type: TOKEN_TYPE.SHIELDED, token: '', amount: '' });

export const SwapInterface: React.FC<SwapInterfaceProps> = ({ knownTokens, onSuccess, activeWallet, connectedApi, browserShieldedAddress, browserUnshieldedAddress, browserNetworkId }) => {
  const [gives, setGives] = useState<{ id: string; entry: TokenEntry }[]>([
    { id: 'gives-0', entry: emptyEntry() }
  ]);
  const [wants, setWants] = useState<{ id: string; entry: TokenEntry }[]>([
    { id: 'wants-0', entry: emptyEntry() }
  ]);

  const { loading, result, execute } = useAsyncAction();

  const addEntry = (side: 'gives' | 'wants') => {
    const id = `${side}-${Date.now()}`;
    const newEntry = { id, entry: emptyEntry() };
    if (side === 'gives') setGives([...gives, newEntry]);
    else setWants([...wants, newEntry]);
  };

  const removeEntry = (side: 'gives' | 'wants', id: string) => {
    if (side === 'gives') setGives(gives.filter(g => g.id !== id));
    else setWants(wants.filter(w => w.id !== id));
  };

  const updateEntry = (side: 'gives' | 'wants', id: string, entry: TokenEntry) => {
    if (side === 'gives') {
      setGives(gives.map(g => g.id === id ? { id, entry } : g));
    } else {
      setWants(wants.map(w => w.id === id ? { id, entry } : w));
    }
  };

  const swapSides = () => {
    const tempGives = gives.map(g => ({ ...g, id: g.id.replace('gives', 'temp') }));
    const tempWants = wants.map(w => ({ ...w, id: w.id.replace('wants', 'temp') }));

    setGives(tempWants.map((w, i) => ({ ...w, id: `gives-swapped-${i}-${Date.now()}` })));
    setWants(tempGives.map((g, i) => ({ ...g, id: `wants-swapped-${i}-${Date.now()}` })));
  };

  const handleSubmit = () => {
    const isBlank = (e: TokenEntry) => !e.token && !e.amount.trim();
    const validGives = gives.map(g => g.entry).filter(e => !isBlank(e));
    const validWants = wants.map(w => w.entry).filter(e => !isBlank(e));

    if (!validGives.length || !validWants.length) {
      execute(async () => { throw new Error('Add at least one token entry for both Giving and Wanting.'); });
      return;
    }

    execute(async (setMessage) => {
      // Token amounts are ledger-side base units — non-negative integers, no
      // decimals, no scientific notation. `Number(amount) > 0` would have let
      // "0.5" and "1.5e10" through and BigInt() would then SyntaxError with no
      // user-actionable message. Validate up front instead.
      const POSITIVE_INT = /^[0-9]+$/;
      const parseAmount = (side: 'gives' | 'wants', e: TokenEntry): bigint => {
        if (!e.token) {
          throw new Error(`A ${side} entry is missing a token selection.`);
        }
        const raw = e.amount.trim();
        if (!POSITIVE_INT.test(raw)) {
          throw new Error(
            `Invalid ${side} amount "${e.amount}" — must be a non-negative integer (no decimals, no scientific notation).`,
          );
        }
        const v = BigInt(raw);
        if (v <= 0n) {
          throw new Error(`Invalid ${side} amount "${e.amount}" — must be greater than 0.`);
        }
        return v;
      };

      const giveAmounts = validGives.map(g => parseAmount('gives', g));
      const wantAmounts = validWants.map(w => parseAmount('wants', w));

      let transactionBytes: Uint8Array;

      if (connectedApi) {
        if (typeof (connectedApi as any).makeIntent !== 'function') {
          throw new Error(
            'This wallet does not support makeIntent. Please update Lace to a version that implements the Midnight dapp-connector swap-intent API.',
          );
        }
        if (!browserShieldedAddress || !browserUnshieldedAddress) {
          throw new Error('Browser wallet connected but addresses are not available yet — try again in a moment.');
        }
        if (!browserNetworkId) {
          throw new Error('Browser wallet connected but network id is not available yet — try again in a moment.');
        }

        const inputs = validGives.map((g, i) => ({
          kind: g.type as 'shielded' | 'unshielded',
          type: g.token,
          value: giveAmounts[i],
        }));
        const outputs = validWants.map((w, i) => {
          const kind = w.type as 'shielded' | 'unshielded';
          return {
            kind,
            type: w.token,
            value: wantAmounts[i],
            recipient: kind === 'shielded' ? browserShieldedAddress : browserUnshieldedAddress,
          };
        });

        setMessage('Building swap intent via browser wallet…');
        let tx: string;
        try {
          // payFees:false: a maker offer is intentionally imbalanced (gives ≠ wants).
          // The taker's wallet pays fees when balancing the completed offer; asking
          // the maker to pay here would either no-op or pull DUST the user didn't
          // intend to commit.
          const result = await connectedApi.makeIntent(inputs, outputs, {
            intentId: 'random',
            payFees: false,
          });
          tx = result.tx;
        } catch (e: any) {
          const msg: string = e?.message ?? String(e);
          if (/not implemented/i.test(msg) || /unsupported/i.test(msg)) {
            throw new Error(
              'This wallet does not support makeIntent. Please update Lace to a version that implements the Midnight dapp-connector swap-intent API.',
            );
          }
          throw e;
        }

        transactionBytes = decodeConnectorTx(tx);

        // Shape check before publishing to Celestia. The taker side
        // (`proveAndSubmitOffer`) sniffs the same set of states and routes to the
        // right balance method; this just makes sure the bytes parse before we
        // publish them.
        setMessage('Validating wallet response…');
        setNetworkId(browserNetworkId as NetworkId);
        const matchedState = detectOfferProofState(transactionBytes);
        console.log(`[swap] wallet returned tx in proof state = ${matchedState}`);
      } else {
        setMessage('Generating Midnight swap transaction…');
        const dataCreate = await api.createSwapOffer(validGives, validWants, activeWallet);
        transactionBytes = base64ToBytes(dataCreate.transactionBytes);
      }

      setMessage('Encoding bech32m offer blob…');

      // gives/wants are derived from tx.imbalances() at index time.
      const blob = encodeOffer(transactionBytes);

      setMessage('Submitting blob to Celestia…');

      const dataSubmit = await api.submitSwapOffer(blob);
      setMessage("Transaction created and submitted successfully!\n\n" + JSON.stringify(dataSubmit, null, 2));

      setTimeout(() => onSuccess(), 2000);
    });
  };

  return (
    <section className="dex-container">
      <h2 style={{ textAlign: 'center', border: 'none', fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '20px' }}>Swap</h2>

      {loading && (
        <LoadingOverlay message={result?.message ?? 'Processing…'} />
      )}

      <div style={{ display: loading ? 'none' : 'block' }}>
        <div className="info-box" style={{ textAlign: 'center', marginBottom: '24px', fontSize: '0.8rem', justifyContent: 'center' }}>
          Offers are submitted as bech32m blobs to the Celestia DA layer.
        </div>

        {/* Giving Panel */}
        <div className="token-panel">
          <div className="token-panel-header"><span>You pay</span></div>
          <div>
            {gives.map((g) => (
              <TokenInput
                key={g.id} id={g.id} entry={g.entry} knownTokens={knownTokens}
                onChange={(id, e) => updateEntry('gives', id, e)}
                onRemove={(id) => removeEntry('gives', id)}
                showRemove={gives.length > 1}
              />
            ))}
          </div>
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <button onClick={() => addEntry('gives')} className="btn-link">+ Add another token</button>
          </div>
        </div>

        {/* Swap Icon */}
        <div className="dex-swap-icon">
          <button className="dex-swap-btn" onClick={swapSides} title="Swap Give and Want">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
          </button>
        </div>

        {/* Wanting Panel */}
        <div className="token-panel">
          <div className="token-panel-header"><span>You receive</span></div>
          <div>
            {wants.map((w) => (
              <TokenInput
                key={w.id} id={w.id} entry={w.entry} knownTokens={knownTokens}
                onChange={(id, e) => updateEntry('wants', id, e)}
                onRemove={(id) => removeEntry('wants', id)}
                showRemove={wants.length > 1}
              />
            ))}
          </div>
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <button onClick={() => addEntry('wants')} className="btn-link">+ Add another token</button>
          </div>
        </div>

        <button className="dex-submit-btn" onClick={handleSubmit} disabled={loading}>
          Create Transaction
        </button>

        {result && (
          <div className="result" style={{ display: 'block', marginTop: '16px', color: result.type === 'error' ? '#dc2626' : undefined }}>
            {result.message}
          </div>
        )}
      </div>
    </section>
  );
};
