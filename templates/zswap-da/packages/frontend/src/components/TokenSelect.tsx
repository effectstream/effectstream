import React, { useEffect, useRef, useState } from 'react';
import type { KnownToken } from '../types';

interface TokenSelectProps {
  value: string;
  tokens: KnownToken[];
  onSelect: (value: string) => void;
}

export const TokenSelect: React.FC<TokenSelectProps> = ({ value, tokens, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = tokens.find(t => t.token_color === value);
  const pick = (val: string) => { onSelect(val); setOpen(false); };

  return (
    <div ref={ref} className="token-selector">
      <button
        type="button"
        className="token-select-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.name ?? 'Select Token'}</span>
        {selected?.kind === 'shielded' && <span aria-hidden>🛡️</span>}
        <span aria-hidden className="token-select-caret">▾</span>
      </button>

      {open && (
        <ul role="listbox" className="token-select-popup">
          <li
            role="option"
            aria-selected={value === ''}
            className="token-select-option token-select-option-placeholder"
            onClick={() => pick('')}
          >
            Select Token
          </li>
          {tokens.map(t => (
            <li
              key={t.token_color}
              role="option"
              aria-selected={value === t.token_color}
              className="token-select-option"
              onClick={() => pick(t.token_color)}
            >
              <span className="token-select-name">{t.name}</span>
              <span aria-hidden className="token-select-shield">
                {t.kind === 'shielded' ? '🛡️' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
