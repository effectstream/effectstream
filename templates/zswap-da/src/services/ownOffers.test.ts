// The own-offer question: which offers of a selection are yours, what to ask,
// and what continues after each answer. The regression this pins is issue
// 00003 — an all-mine selection must produce a QUESTION, never a dead end.
import { describe, expect, test } from 'bun:test';
import {
  applyOwnOfferChoice,
  decideOwnOffers,
  ownOfferChoiceLabel,
  partitionOwn,
} from './ownOffers';

// Stand-in for the Order rows the take path works with: `isMine` is the local
// record, `sender` is what the unshielded-sender match finds once the blob is
// loaded. The predicate composes both, exactly as useZSwapApp's `ownsOffer` does.
interface Row { id: string; isMine: boolean; sender?: string }
const SELF = 'ab'.repeat(32);
const row = (id: string, isMine = false, sender?: string): Row => ({ id, isMine, sender });
const owns = (o: Row) => o.isMine || o.sender === SELF;
const split = (rows: Row[]) => partitionOwn(rows, owns);

describe('partitionOwn', () => {
  test('splits by the predicate and keeps the original order in `all`', () => {
    const rows = [row('a'), row('b', true), row('c')];
    const s = split(rows);
    expect(s.mine.map((o) => o.id)).toEqual(['b']);
    expect(s.others.map((o) => o.id)).toEqual(['a', 'c']);
    expect(s.all).toBe(rows);
  });

  test('the unshielded-sender match counts as mine, after blob load', () => {
    // Not in the local record — only the decoded sender gives it away.
    const s = split([row('a'), row('b', false, SELF)]);
    expect(s.mine.map((o) => o.id)).toEqual(['b']);
  });

  test('empty selection', () => {
    const s = split([]);
    expect(s.mine).toEqual([]);
    expect(s.others).toEqual([]);
  });
});

describe('decideOwnOffers', () => {
  test('none of yours → nothing to ask', () => {
    const d = decideOwnOffers(split([row('a'), row('b')]));
    expect(d.kind).toBe('none');
    expect(d.message).toBeNull();
    expect(d.choices).toEqual([]);
  });

  test('a single own offer → "take anyway?" with a cancel', () => {
    const d = decideOwnOffers(split([row('a', true)]));
    expect(d.kind).toBe('all-mine');
    expect(d.message).toBe('This is your own offer. Take it anyway?');
    expect(d.choices).toEqual(['take-all', 'cancel']);
    // Never "skip mine": it would continue with nothing.
    expect(d.choices).not.toContain('skip-mine');
  });

  test('every offer of a level is yours → plural phrasing', () => {
    const d = decideOwnOffers(split([row('a', true), row('b', true)]));
    expect(d.kind).toBe('all-mine');
    expect(d.mine).toBe(2);
    expect(d.message).toContain('All 2 selected offers are yours');
  });

  test('mixed → counts + all three choices', () => {
    const d = decideOwnOffers(split([row('a', true), row('b'), row('c'), row('d', false, SELF)]));
    expect(d.kind).toBe('mixed');
    expect(d.mine).toBe(2);
    expect(d.total).toBe(4);
    expect(d.message).toBe('2 of 4 selected offers are yours. Skip them, or take them too?');
    expect(d.choices).toEqual(['skip-mine', 'take-all', 'cancel']);
  });

  test('empty selection asks nothing', () => {
    expect(decideOwnOffers(split([])).kind).toBe('none');
  });
});

describe('applyOwnOfferChoice', () => {
  const s = split([row('a', true), row('b'), row('c')]);

  test('take-all continues with the whole selection, in order', () => {
    expect(applyOwnOfferChoice(s, 'take-all')!.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  test('skip-mine continues with the others only', () => {
    expect(applyOwnOfferChoice(s, 'skip-mine')!.map((o) => o.id)).toEqual(['b', 'c']);
  });

  test('cancel settles nothing', () => {
    expect(applyOwnOfferChoice(s, 'cancel')).toBeNull();
  });

  test('a choice that would leave nothing settles nothing (FR-005)', () => {
    const allMine = split([row('a', true)]);
    expect(applyOwnOfferChoice(allMine, 'skip-mine')).toBeNull();
    expect(applyOwnOfferChoice(split([]), 'take-all')).toBeNull();
  });
});

describe('ownOfferChoiceLabel', () => {
  test('single own offer', () => {
    const d = decideOwnOffers(split([row('a', true)]));
    expect(ownOfferChoiceLabel('take-all', d)).toBe('Take anyway');
    expect(ownOfferChoiceLabel('cancel', d)).toBe('Cancel');
  });

  test('several own offers', () => {
    const d = decideOwnOffers(split([row('a', true), row('b', true)]));
    expect(ownOfferChoiceLabel('take-all', d)).toBe('Take them anyway');
  });

  test('mixed selection', () => {
    const d = decideOwnOffers(split([row('a', true), row('b')]));
    expect(ownOfferChoiceLabel('take-all', d)).toBe('Include mine');
    expect(ownOfferChoiceLabel('skip-mine', d)).toBe('Skip mine');
  });
});
