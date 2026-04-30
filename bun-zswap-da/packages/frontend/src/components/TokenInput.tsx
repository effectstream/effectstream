import React from 'react';
import type { KnownToken, TokenEntry } from '../types';

interface TokenInputProps {
  id: string;
  entry: TokenEntry;
  knownTokens: KnownToken[];
  onChange: (id: string, updated: TokenEntry) => void;
  onRemove?: (id: string) => void;
  showRemove: boolean;
}

export const TokenInput: React.FC<TokenInputProps> = ({ id, entry, knownTokens, onChange, onRemove, showRemove }) => {
  const isCustom = !knownTokens.find(t => t.token_color === entry.token) && entry.token !== '';
  const tokenSelectValue = isCustom ? 'custom' : entry.token;

  return (
    <div className="token-entry-dex">
      <div className="token-input-row">
        <input 
          type="number" 
          className="token-amount-input" 
          placeholder="0.0" 
          min="0"
          value={entry.amount}
          onChange={(e) => onChange(id, { ...entry, amount: e.target.value })}
        />

        <div className="token-selector">
          <select
            value={tokenSelectValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'custom') {
                onChange(id, { ...entry, token: '', type: 'shielded' });
              } else {
                const picked = knownTokens.find(t => t.token_color === val);
                onChange(id, { ...entry, token: val, type: picked?.kind ?? 'shielded' });
              }
            }}
          >
            <option value="">Select Token</option>
            {knownTokens.map(t => (
              <option key={t.token_color} value={t.token_color}>{t.name}</option>
            ))}
            <option value="custom">Custom Token...</option>
          </select>
        </div>
      </div>

      {isCustom && (
        <div style={{ marginTop: '12px' }}>
          <input 
            type="text" 
            placeholder="Token hex address..."
            style={{ marginBottom: '8px' }}
            value={entry.token}
            onChange={(e) => onChange(id, { ...entry, token: e.target.value })}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <select
              style={{ width: 'auto', padding: '4px 8px' }}
              value={entry.type}
              onChange={(e) => onChange(id, { ...entry, type: e.target.value })}
            >
              <option value="shielded">Shielded</option>
              <option value="unshielded">Unshielded</option>
            </select>
          </div>
        </div>
      )}

      {showRemove && onRemove && (
        <div style={{ textAlign: 'right', marginTop: '8px' }}>
          <button 
            className="btn-small btn-danger" 
            onClick={() => onRemove(id)}
            style={{ margin: 0, padding: '2px 8px', fontSize: '0.75rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444' }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};
