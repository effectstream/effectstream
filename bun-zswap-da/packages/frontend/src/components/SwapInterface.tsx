import React, { useState } from 'react';
import { TokenInput } from './TokenInput';
import type { KnownToken, TokenEntry } from '../types';
import { api } from '../services/api';

interface SwapInterfaceProps {
  knownTokens: KnownToken[];
  onSuccess: () => void;
}

export const SwapInterface: React.FC<SwapInterfaceProps> = ({ knownTokens, onSuccess }) => {
  const [gives, setGives] = useState<{ id: string; entry: TokenEntry }[]>([
    { id: 'gives-0', entry: { type: 'shielded', token: '', amount: '' } }
  ]);
  const [wants, setWants] = useState<{ id: string; entry: TokenEntry }[]>([
    { id: 'wants-0', entry: { type: 'shielded', token: '', amount: '' } }
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const addEntry = (side: 'gives' | 'wants') => {
    const id = `${side}-${Date.now()}`;
    const newEntry = { id, entry: { type: 'shielded', token: '', amount: '' } };
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

  const handleSubmit = async () => {
    const validGives = gives.map(g => g.entry).filter(e => e.token && e.amount && Number(e.amount) > 0);
    const validWants = wants.map(w => w.entry).filter(e => e.token && e.amount && Number(e.amount) > 0);

    if (!validGives.length || !validWants.length) {
      setResult({ type: 'error', message: 'Add at least one token entry for both Giving and Wanting.' });
      return;
    }

    setLoading(true);
    setResult({ type: 'success', message: 'Generating Midnight swap transaction…' });

    try {
      const dataCreate = await api.createSwapOffer(validGives, validWants);
      const transaction = dataCreate.transaction;
      
      setResult({ type: 'success', message: 'Submitting blob to Celestia…' });
      
      const dataSubmit = await api.submitSwapOffer(transaction, validGives, validWants);
      setResult({ type: 'success', message: "Transaction created and submitted successfully!\n\n" + JSON.stringify(dataSubmit, null, 2) });
      
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Failed to submit offer' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="dex-container">
      <h2 style={{ textAlign: 'center', border: 'none', fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '20px' }}>Swap</h2>
      
      <div className="info-box" style={{ textAlign: 'center', marginBottom: '24px', fontSize: '0.8rem', justifyContent: 'center' }}>
        Offers are submitted as JSON blobs to the Celestia DA layer.
      </div>

      {/* Giving Panel */}
      <div className="token-panel">
        <div className="token-panel-header">
          <span>You pay</span>
        </div>
        <div>
          {gives.map((g) => (
            <TokenInput 
              key={g.id} 
              id={g.id} 
              entry={g.entry} 
              knownTokens={knownTokens} 
              onChange={(id, e) => updateEntry('gives', id, e)} 
              onRemove={(id) => removeEntry('gives', id)} 
              showRemove={gives.length > 1} 
            />
          ))}
        </div>
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <button 
            onClick={() => addEntry('gives')} 
            style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '0.8rem', padding: '4px', cursor: 'pointer' }}
          >
            + Add another token
          </button>
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
        <div className="token-panel-header">
          <span>You receive</span>
        </div>
        <div>
          {wants.map((w) => (
            <TokenInput 
              key={w.id} 
              id={w.id} 
              entry={w.entry} 
              knownTokens={knownTokens} 
              onChange={(id, e) => updateEntry('wants', id, e)} 
              onRemove={(id) => removeEntry('wants', id)} 
              showRemove={wants.length > 1} 
            />
          ))}
        </div>
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <button 
            onClick={() => addEntry('wants')} 
            style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '0.8rem', padding: '4px', cursor: 'pointer' }}
          >
            + Add another token
          </button>
        </div>
      </div>

      <button 
        className="dex-submit-btn" 
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Create Transaction'}
      </button>
      
      {result && (
        <div className="result" style={{ display: 'block', marginTop: '16px', color: result.type === 'error' ? '#dc2626' : undefined }}>
          {result.message}
        </div>
      )}
    </section>
  );
};
