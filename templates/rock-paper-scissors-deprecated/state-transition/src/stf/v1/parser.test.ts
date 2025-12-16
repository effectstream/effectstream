import parse from './parser';
import type { UserStats, ZombieRound } from './types';

describe('Input parsing', () => {
  test('parses createLobby', () => {
    const normalLobby = parse('c|20|100||');
    expect(normalLobby.input).toBe('createdLobby');

    const hiddenLobby = parse('c|20|100|T|');
    expect(hiddenLobby.input).toBe('createdLobby');

    const practiceLobby = parse('c|20|100||T');
    expect(practiceLobby.input).toBe('createdLobby');
  });

  test('parses joinLobby', () => {
    const parsed = parse('j|*Xs6Q9GAqZVwe');
    expect(parsed.input).toBe('joinedLobby');
  });

  test('parses closeLobby', () => {
    const parsed = parse('cs|*Xs6Q9GAqZVwe');
    expect(parsed.input).toBe('closedLobby');
  });

  test('parses submitMoves', () => {
    const parsed = parse('s|*Xs6Q9GAqZVwe|2|R');
    expect(parsed.input).toBe('submittedMoves');
  });

  test('parses scheduled data', () => {
    const zombie = parse('z|*Xs6Q9GAqZVwe');
    expect(zombie.input).toBe('scheduledData');
    expect((zombie as ZombieRound).effect).toBe('zombie');

    const stats = parse('u|*0xc02aeafdca98755a2bfbcdf5f68364aacef67d3c|w');
    expect(stats.input).toBe('scheduledData');
    expect((stats as UserStats).effect).toBe('stats');
  });
});
