// TokenChip — structured token display used everywhere a token ID appears in the UI.
//
// Full (default): [coin logo]  Name  short-id
//   The Coin logo already shows the full 64-hex address after a 2s hover via
//   the .zs-coin--tip CSS class. Clicking the chip copies the full ID.
//
// Inline: Name short-id — rendered as a tight inline <span>, same hover + copy.
//   Used in compact contexts like order-book column headers.

import { useState, useCallback } from 'react';
import { Coin } from './icons';
import { shortToken } from '../utils';
import type { KnownToken } from '../types';

interface TokenChipProps {
  color: string;
  knownTokens?: KnownToken[];
  size?: 'sm' | 'md';
  /** Omit the Coin logo; render as a tight inline span. */
  inline?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TokenChip({
  color,
  knownTokens = [],
  size = 'md',
  inline = false,
  className,
  style,
}: TokenChipProps) {
  const [copied, setCopied] = useState(false);

  const token = knownTokens.find((t) => t.token_color === color);
  const name = token?.name ?? shortToken(color);
  const short = shortToken(color);
  const hasName = name !== short;

  const copy = useCallback(() => {
    navigator.clipboard.writeText(color).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [color]);

  if (inline) {
    return (
      <span
        className={'zs-token-id' + (className ? ' ' + className : '')}
        data-tip={color}
        onClick={copy}
        style={{ position: 'relative', ...style }}
      >
        <span style={{ fontWeight: 700 }}>{name}</span>
        {hasName && (
          <span className="zs-num" style={{ color: 'var(--ink-3)', fontSize: '0.82em' }}>
            {short}
          </span>
        )}
        {copied && <CopiedFlash />}
      </span>
    );
  }

  const sm = size === 'sm';
  return (
    <span
      onClick={copy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sm ? 6 : 8,
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        ...style,
      }}
      className={className}
      title="Click to copy token ID"
    >
      <Coin sym={name} address={color} size={sm ? 'sm' : undefined} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: sm ? 12.5 : 13.5, whiteSpace: 'nowrap' }}>
          {name}
        </span>
        {hasName && (
          <span className="zs-num" style={{ fontSize: 10.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {short}
          </span>
        )}
      </span>
      {copied && <CopiedFlash />}
    </span>
  );
}

function CopiedFlash() {
  return (
    <span
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--pos)',
        color: '#fff',
        padding: '3px 9px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        zIndex: 101,
        pointerEvents: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,.22)',
      }}
    >
      Copied!
    </span>
  );
}
