// Faucet — ported from the mock's faucet.jsx, wired to REAL minting via the
// contract (useContract.mintShielded / mintUnshielded, exposed on `st`). Unlike
// the mock (which sends to an arbitrary address), minting goes to your CONNECTED
// wallet: mint_shielded credits your shielded balance; mint_unshielded credits
// your unshielded address. Requires a browser wallet (ConnectedAPI / Lace).

import { useMemo, useState } from 'react';
import { Icon } from '../ui/icons';
import { MAX_TOKEN_NAME_LENGTH } from '../constants';
import { DEFAULT_DECIMALS, formatAmount, parseWholeCoins } from '../state/amount';
import { formatShieldedAddress } from '../state/shieldedAddress';
import type { ZSwapApp } from '../state/useZSwapApp';

const NETWORK_ID = (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string) || 'undeployed';

type Kind = 'shielded' | 'unshielded';
interface Preset { name: string; kind: Kind; glyph: string; tint: string; desc: string }

const PRESETS: Preset[] = [
  { name: 'WBTC', kind: 'shielded', glyph: '₿', tint: '#F7931A', desc: 'Shielded — private balance' },
  { name: 'WETH', kind: 'shielded', glyph: 'Ξ', tint: '#6E3BE0', desc: 'Shielded — private balance' },
  { name: 'USDC', kind: 'shielded', glyph: '$', tint: '#2775CA', desc: 'Shielded — private balance' },
  { name: 'ZTOKEN', kind: 'shielded', glyph: '◓', tint: '#0000FE', desc: 'Shielded — private balance' },
  { name: 'ATOKEN', kind: 'unshielded', glyph: '◇', tint: '#5A6473', desc: 'Public — visible on-chain' },
  { name: 'BTOKEN', kind: 'unshielded', glyph: '◇', tint: '#8A93A3', desc: 'Public — visible on-chain' },
];

// Deterministic 32-byte domain separator from the token name, so re-minting the
// same name credits the SAME token color (balance accumulates) rather than a
// fresh color each time. The shielded nonce stays unique per mint (coin UTXO).
function domainSepFromName(name: string): Uint8Array {
  const out = new Uint8Array(32);
  const enc = new TextEncoder().encode('zswap-da-faucet:' + name);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < 32; i++) {
    h = (h ^ (enc[i % enc.length] ?? i + 7)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
}

function sanitizeName(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, MAX_TOKEN_NAME_LENGTH);
}

function shortAddr(a: string | null): string {
  if (!a) return '—';
  return a.length > 24 ? a.slice(0, 14) + '…' + a.slice(-6) : a;
}

interface Receipt { name: string; amount: string; kind: Kind; color: string; txHash: string }

// Fixed faucet allotment: 1,000 WHOLE COINS.
//
// Faucet tokens are minted at DEFAULT_DECIMALS and registered as such, so the
// circuit is called with 1,000 × 10^6 = 1_000_000_000 base units while the user
// is told, correctly, that they received 1,000 of the token. The scaling is
// `parseWholeCoins`, never `1000 * 1e6`.
const MINT_DECIMALS = DEFAULT_DECIMALS;
const MINT_COINS = '1000';
const MINT_BASE_UNITS = parseWholeCoins(MINT_COINS, MINT_DECIMALS)!;
const MINT_AMOUNT_STR = formatAmount(MINT_BASE_UNITS, MINT_DECIMALS);

export function Faucet({ st }: { st: ZSwapApp }) {
  const net = st.network || 'Undeployed';
  const [name, setName] = useState(PRESETS[0].name);
  const [kind, setKind] = useState<Kind>(PRESETS[0].kind);
  const [status, setStatus] = useState<'idle' | 'minting' | 'done'>('idle');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.length > 0;
  const activePreset = PRESETS.find((p) => p.name === name && p.kind === kind);
  // Caption only — the mint recipient is derived inside the contract wallet
  // from getShieldedKeys(), never from this string, so formatting it for
  // display changes nothing about what is submitted.
  const toAddr = kind === 'shielded'
    ? formatShieldedAddress(st.shieldedAddress, st.shieldedEncryptionPublicKey, NETWORK_ID)
    : st.unshieldedAddress;

  const selectPreset = (p: Preset) => {
    setName(p.name);
    setKind(p.kind);
    setStatus('idle');
    setErr(null);
  };

  const mint = async () => {
    if (!valid || status === 'minting') return;
    if (!st.canMint) {
      st.connect();
      return;
    }
    setStatus('minting');
    setErr(null);
    try {
      const dsep = domainSepFromName(name);
      const res = kind === 'shielded'
        ? await st.mintShielded(dsep, MINT_BASE_UNITS, BigInt(Date.now()), name, MINT_DECIMALS)
        : await st.mintUnshielded(dsep, MINT_BASE_UNITS, name, MINT_DECIMALS);
      setReceipt({ name, amount: MINT_AMOUNT_STR, kind, color: res.color, txHash: res.txHash });
      setStatus('done');
      st.toast(`${MINT_AMOUNT_STR} ${name} minted`, 'ok');
      st.onMinted();
    } catch (e: any) {
      setStatus('idle');
      const msg = e?.message ?? String(e);
      setErr(msg);
      st.toast(`Mint failed: ${msg}`);
    }
  };

  // Button label/behaviour reflects connection + contract state.
  const btn = useMemo(() => {
    if (!st.wallet) return { label: 'Connect a wallet to mint', disabled: false, onClick: () => st.connect() };
    if (!st.canMint) return { label: 'Minting needs the browser wallet (Lace)', disabled: true, onClick: () => {} };
    if (status === 'minting') return { label: 'Minting…', disabled: true, onClick: () => {} };
    return { label: `Mint ${name}`, disabled: !valid, onClick: mint };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.wallet, st.canMint, status, name, valid, kind]);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <span className="zs-pill" style={{ marginBottom: 12 }}><Icon.dot style={{ color: 'var(--accent)' }} /> {net}</span>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 8px' }}>Faucet</h1>
        <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>Mint free test tokens to your connected <b>{net}</b> wallet and try ZSwaps with no risk.</p>
      </div>

      <div className="zs-card" style={{ padding: 'var(--pad-card)' }}>
        <div className="zs-field-label" style={{ marginBottom: 10 }}>Choose a token</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {PRESETS.map((t) => {
            const on = name === t.name && kind === t.kind;
            return (
              <button key={t.name + t.kind} onClick={() => selectPreset(t)} style={{ textAlign: 'left', padding: 14, borderRadius: 'var(--r-field)', cursor: 'pointer', background: on ? 'var(--accent-soft)' : 'var(--surface-2)', border: '1.5px solid ' + (on ? 'var(--accent)' : 'transparent'), transition: 'all .15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: t.tint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{t.glyph}</span>
                  {t.kind === 'shielded' ? <span className="zs-badge-shield"><Icon.shield /> Shielded</span> : <span className="zs-pill" style={{ padding: '4px 8px' }}><Icon.eye /> Unshielded</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.35 }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        {/* token name (custom names allowed; presets just prefill). The privacy
            kind is intrinsic to the token, shown read-only — not a user choice. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="zs-field-label">Token name</span>
          {kind === 'shielded'
            ? <span className="zs-badge-shield"><Icon.shield /> Shielded</span>
            : <span className="zs-pill" style={{ padding: '4px 8px' }}><Icon.eye /> Unshielded</span>}
        </div>
        <div className="zs-field" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {kind === 'shielded' ? <Icon.shield style={{ color: 'var(--accent)' }} /> : <Icon.eye style={{ color: 'var(--ink-3)' }} />}
          <input value={name} onChange={(e) => { setName(sanitizeName(e.target.value)); setStatus('idle'); }} placeholder="e.g. ZTOKEN" spellCheck={false}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink)', textTransform: 'uppercase' }} />
          <span className="zs-num" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{MINT_AMOUNT_STR} coins</span>
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 18 }}>
          {st.wallet
            ? <>Minting <b className="zs-num" style={{ color: 'var(--ink-2)' }}>{MINT_AMOUNT_STR} {name || '—'}</b> to your {kind} balance <span className="zs-num">· {shortAddr(toAddr)}</span></>
            : <>Connect a wallet to receive minted tokens.</>}
          {activePreset == null && name && <> · custom token type</>}
        </div>

        {status === 'done' && receipt ? (
          <div style={{ padding: 16, borderRadius: 'var(--r-field)', background: 'var(--pos-soft)', border: '1px solid color-mix(in srgb, var(--pos) 25%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 15, color: 'var(--pos)' }}>{receipt.kind === 'shielded' ? <Icon.shield /> : <Icon.eye />} Minted {receipt.amount} {receipt.name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12.5, gap: 12 }}><span style={{ color: 'var(--ink-3)' }}>Color</span><span className="zs-num" style={{ color: 'var(--ink-2)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{receipt.color.slice(0, 12)}…{receipt.color.slice(-8)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5, gap: 12 }}><span style={{ color: 'var(--ink-3)' }}>Tx</span><span className="zs-num" style={{ color: 'var(--ink-2)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{receipt.txHash ? receipt.txHash.slice(0, 12) + '…' + receipt.txHash.slice(-8) : '—'}</span></div>
            <button onClick={() => { setStatus('idle'); setErr(null); }} className="zs-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: 11 }}>Mint another</button>
          </div>
        ) : (
          <>
            <button onClick={btn.onClick} disabled={btn.disabled} className="zs-btn zs-btn--primary zs-btn--block"
              style={{ opacity: btn.disabled ? 0.5 : 1, cursor: btn.disabled ? 'default' : 'pointer' }}>
              {status === 'minting' ? <>{btn.label}</> : <><Icon.drop /> {btn.label}</>}
            </button>
            {err && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--neg)', lineHeight: 1.45, wordBreak: 'break-word' }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
