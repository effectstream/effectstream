import React, { useState } from 'react';
import { TokenInput } from './TokenInput';
import type { KnownToken, TokenEntry } from '../types';
import { api } from '../services/api';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { TOKEN_TYPE } from '../constants';
import { encodeOffer } from 'mip-zswap-offer';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface SwapInterfaceProps {
  knownTokens: KnownToken[];
  onSuccess: () => void;
  activeWallet?: string;
}

const emptyEntry = (): TokenEntry => ({ type: TOKEN_TYPE.SHIELDED, token: '', amount: '' });

export const SwapInterface: React.FC<SwapInterfaceProps> = ({ knownTokens, onSuccess, activeWallet }) => {
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
    const validGives = gives.map(g => g.entry).filter(e => e.token && e.amount && Number(e.amount) > 0);
    const validWants = wants.map(w => w.entry).filter(e => e.token && e.amount && Number(e.amount) > 0);

    if (!validGives.length || !validWants.length) {
      execute(async () => { throw new Error('Add at least one token entry for both Giving and Wanting.'); });
      return;
    }

    execute(async (setMessage) => {
      setMessage('Generating Midnight swap transaction…');

      const dataCreate = await api.createSwapOffer(validGives, validWants, activeWallet);
      const transactionBytes = base64ToBytes(dataCreate.transactionBytes);

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
