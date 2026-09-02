import { describe, expect, test } from 'bun:test';
import { isShieldedAddress, truncateAddress } from './utils';

// Real 135-character shielded address (local JS wallet keys, undeployed).
const SHIELDED =
  'mn_shield-addr_undeployed1qrdysugev8mhtgn8wvl64kpepy4zuwj06jrl0jkerfax7xswr3sngr30cu2vwevpj32z2r2z8xtvltzw8cfgcuklx8qhuc7yrthwtdgqhz8fj';
const SHIELDED_TESTNET = SHIELDED.replace('_undeployed1', '_testnet1');
// 'mainnet' is the one network whose segment the address format omits.
const SHIELDED_MAINNET = SHIELDED.replace('_undeployed1', '1');

const UNSHIELDED = 'mn_addr_undeployed14dunrde2fuwg60jmjpm2rsk5umuqj9f88py4qctjsw2q2psd7zgqqtsnha';
const HEX = 'ab7931b72a4f1c8d3e5b9076a1c2d4e6f80915273849506172839405060df090';

describe('isShieldedAddress', () => {
  test('recognises shielded addresses on every network', () => {
    expect(isShieldedAddress(SHIELDED)).toBe(true);
    expect(isShieldedAddress(SHIELDED_TESTNET)).toBe(true);
    expect(isShieldedAddress(SHIELDED_MAINNET)).toBe(true);
  });

  test('rejects everything the menu can show instead', () => {
    // WalletMenu picks the address font size off this, so an unshielded or
    // still-syncing value must keep the original 12.5px.
    expect(isShieldedAddress(UNSHIELDED)).toBe(false);
    expect(isShieldedAddress(HEX)).toBe(false);
    expect(isShieldedAddress('')).toBe(false);
  });
});

describe('truncateAddress — shielded addresses get a wider head', () => {
  test('keeps the whole human-readable part', () => {
    // 26 head + '…' + 6 tail. The old 10-character head stopped inside the
    // constant tag ('mn_shield-'), hiding the network segment entirely.
    expect(truncateAddress(SHIELDED)).toBe('mn_shield-addr_undeployed1…qhz8fj');
  });

  test('the network segment is visible (the point of the wider head)', () => {
    expect(truncateAddress(SHIELDED)).toContain('_undeployed');
    expect(truncateAddress(SHIELDED_TESTNET)).toContain('_testnet');
    // 'undeployed' is the longest network id we ship, so it consumes the whole
    // head; a shorter id spends the remainder on key material.
    expect(truncateAddress(SHIELDED_TESTNET)).toBe('mn_shield-addr_testnet1qrd…qhz8fj');
  });

  test('mainnet (no network segment) still uses the wide head', () => {
    expect(truncateAddress(SHIELDED_MAINNET)).toBe('mn_shield-addr1qrdysugev8m…qhz8fj');
  });

  test('two wallets on one network stay distinguishable', () => {
    // On undeployed the head is all human-readable part, so the tail carries
    // the difference; on a shorter network id the head does too.
    const otherTail = SHIELDED.slice(0, -6) + 'zzzzzz';
    expect(truncateAddress(otherTail)).not.toBe(truncateAddress(SHIELDED));
    const otherHead = SHIELDED_TESTNET.slice(0, 23) + 'zzz' + SHIELDED_TESTNET.slice(26);
    expect(truncateAddress(otherHead)).not.toBe(truncateAddress(SHIELDED_TESTNET));
  });

  test('renders 33 characters — the width the 280px dropdown was measured against', () => {
    // 210.5px of the 213px the row leaves for text, at the 11px the menu uses
    // for shielded addresses. Widening the head further wraps onto two lines.
    expect(truncateAddress(SHIELDED)).toHaveLength(33);
    expect(truncateAddress(SHIELDED_TESTNET)).toHaveLength(33);
    expect(truncateAddress(SHIELDED_MAINNET)).toHaveLength(33);
  });

  test('a shielded address short enough to fit is returned whole', () => {
    const short = 'mn_shield-addr_undeployed1';
    expect(truncateAddress(short)).toBe(short);
  });
});

describe('truncateAddress — everything else keeps the original 10 + 6 rule', () => {
  test('an unshielded mn_addr_ address is unchanged', () => {
    expect(truncateAddress(UNSHIELDED)).toBe('mn_addr_un...qtsnha');
    expect(truncateAddress(UNSHIELDED)).toBe(UNSHIELDED.slice(0, 10) + '...' + UNSHIELDED.slice(-6));
  });

  test('raw hex (the no-encryption-key fallback) is unchanged', () => {
    expect(truncateAddress(HEX)).toBe(HEX.slice(0, 10) + '...' + HEX.slice(-6));
  });

  test('strings of 16 characters or fewer are returned verbatim', () => {
    expect(truncateAddress('')).toBe('');
    expect(truncateAddress('short')).toBe('short');
    expect(truncateAddress('0123456789abcdef')).toBe('0123456789abcdef');
    expect(truncateAddress('0123456789abcdefg')).toBe('0123456789...bcdefg');
  });

  test('a near-miss prefix does not get the wide head', () => {
    // Only the exact shielded tag opts in; mn_shield_ (no '-addr') does not.
    const nearMiss = 'mn_shield_undeployed1qrdysugev8mhtgn8wvl64kpepy4zuwj06jrl0jkerfax7';
    expect(truncateAddress(nearMiss)).toBe(nearMiss.slice(0, 10) + '...' + nearMiss.slice(-6));
  });
});
