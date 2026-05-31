// Hex Battle middleware — the ONLY boundary that changed during the
// effectstream migration.
//
// The original game shipped a 200k-line bundled `middleware.js` that re-exported
// `@paima/sdk/mw-core` (postConciseData / buildBackendQuery / document.Paima).
// This file re-implements the SAME `endpoints` surface the game imports —
// `import * as mw from './paima/middleware'`, then `mw.default.<fn>` /
// `mw.ENV.<X>` — on top of `@effectstream/wallets` + plain `fetch`, so every
// game screen (lobby/pregame/game) calls the exact same methods unchanged.
//
//   writes   → sendTransaction(wallet, [<grammarKey>, ...args], config, "wait-receipt")
//   queries  → fetch('http://localhost:9999/<route>')  (see packages/node/api.ts)
//   wallet   → walletLogin({ mode, ... })  — EvmInjected (browser) + EvmViem (local-js)
//
// The grammar-key + arg order is mapped 1:1 against packages/node/grammar.ts.
import {
  EffectstreamConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
  type LoginInfo,
  type Wallet,
} from '@effectstream/wallets';
import {hardhat as hardhatChain} from 'viem/chains';

// The template's viem and @effectstream/wallets' pinned viem can resolve to two
// structurally-identical-but-nominally-distinct `Chain` types; widen once here so
// the EVM config/login calls type-check cleanly (runtime is unaffected).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hardhat: any = hardhatChain;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Hardhat-deterministic address of the first deployed EffectstreamL2 (Ignition).
// Replace with the deployed EffectstreamL2 address on real networks.
export const effectstreamConfig = new EffectstreamConfig(
  'hex-battle',
  'mainEvmRPC',
  '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  hardhat,
  undefined,
  undefined,
  false
);

const API_BASE = 'http://localhost:9999';
const HARDHAT_RPC = 'http://localhost:8545';
// Hardhat well-known account #0 — local-dev only; never use on real chains.
const LOCAL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// `mw.ENV.*` surface the original middleware exposed. The game reads
// BATCHER_URI (to pick batched vs self-sequenced login) and BLOCK_TIME (turn
// timer). This template self-sequences against hardhat, so there's no batcher.
export const ENV = {
  BATCHER_URI: '' as string,
  BLOCK_TIME: 2,
  BACKEND_URI: API_BASE,
};

// ---------------------------------------------------------------------------
// Wallet state (replaces document.Paima / getDefaultActiveAddress)
// ---------------------------------------------------------------------------

let wallet: Wallet | null = null;
let walletAddress: string | null = null;

function currentAddress(): string {
  if (walletAddress) return walletAddress;
  const a = wallet?.provider.getAddress?.()?.address;
  return a ?? '';
}

// Result helpers mirroring @paima/sdk/mw-core's Result<T> / FailedResult shapes
// the game branches on (`if (x.success) ...`).
type OkResult<T> = {success: true; result: T};
type DataResult<T> = {success: true; data: T};
type Failed = {success: false; errorMessage: string; errorCode?: number};

function fail(errorMessage: string, errorCode = 1): Failed {
  console.error('[hex-battle middleware]', errorMessage);
  return {success: false, errorMessage, errorCode};
}

// ---------------------------------------------------------------------------
// Wallet login (EvmInjected for browsers, EvmViem for local-js / headless e2e)
// ---------------------------------------------------------------------------

async function loginWithInfo(loginInfo: LoginInfo) {
  const result = await walletLogin(loginInfo);
  if (!result.success) {
    return fail('Wallet login failed');
  }
  wallet = result.result;
  walletAddress = wallet.walletAddress ?? currentAddress();
  // The game reads `x.result.walletAddress`.
  return {
    success: true as const,
    result: {walletAddress: walletAddress},
  };
}

// userWalletLogin keeps the same call shape the game uses
//   mw.default.userWalletLogin(nameToLogin(name, batcherEnabled))
// nameToLogin (see ../frontend/name_to_login.ts) now returns a
// @effectstream/wallets LoginInfo. EvmViem carries its own privateKey/rpcUrl.
async function userWalletLogin(loginInfo: LoginInfo, _setDefault?: boolean) {
  // EvmViem needs the local key + RPC; nameToLogin only sets the mode, so fill
  // the local-js connection details here.
  if (loginInfo.mode === WalletMode.EvmViem) {
    return loginWithInfo({
      mode: WalletMode.EvmViem,
      privateKey: LOCAL_PRIVATE_KEY,
      rpcUrl: HARDHAT_RPC,
      chain: hardhat,
      preferBatchedMode: false,
    } as LoginInfo);
  }
  return loginWithInfo(loginInfo);
}

// Convenience helpers the test harness / index.html buttons can call directly.
async function connectBrowserWallet() {
  return loginWithInfo({
    mode: WalletMode.EvmInjected,
    chain: effectstreamConfig.effectstreamL2Chain,
  } as LoginInfo);
}

async function connectLocalWallet() {
  return loginWithInfo({
    mode: WalletMode.EvmViem,
    privateKey: LOCAL_PRIVATE_KEY,
    rpcUrl: HARDHAT_RPC,
    chain: hardhat,
    preferBatchedMode: false,
  } as LoginInfo);
}

async function checkWalletStatus() {
  return {success: true, message: '', result: currentAddress()};
}

// Re-exported (the game's middleware.d.ts re-exported these); kept as no-ops /
// thin shims so import sites resolve.
export function userWalletLoginWithoutChecks(loginInfo: LoginInfo) {
  return loginWithInfo(loginInfo);
}
export function updateBackendUri(uri: string) {
  ENV.BACKEND_URI = uri;
}
export async function getRemoteBackendVersion(): Promise<string> {
  return '1.0.0';
}

// getUserWallet — returns the connected wallet address (or errors via errorFxn).
// Matches the original signature `(wallet, errorFxn) => Result<string>`.
function getUserWallet(
  walletArg: string | null,
  errorFxn?: (code: number, err?: unknown) => Failed
): OkResult<string> | Failed {
  if (walletArg) return {success: true, result: walletArg};
  const addr = currentAddress();
  if (!addr) {
    return errorFxn ? errorFxn(1008) : fail('Wallet not connected', 1008);
  }
  return {success: true, result: addr};
}

// ---------------------------------------------------------------------------
// Write endpoints → sendTransaction(wallet, [<grammarKey>, ...args], ...)
//
// grammar.ts field order is the source of truth:
//   createLobby: numOfPlayers|units|buildings|gold|initTiles|map|timeLimit|roundLimit
//   joinLobby:   lobbyID
//   submitMoves: lobbyID|roundNumber|move
//   surrender:   lobbyID
// ---------------------------------------------------------------------------

const TIME_LIMIT = 9999; // original middleware hardcoded both to "9999"
const ROUND_LIMIT = 9999;

async function createLobby(
  numOfPlayers: number,
  units: string,
  buildings: string,
  gold: number,
  initTiles: number,
  map: string[]
): Promise<DataResult<{lobby_id: string; lobbyStatus: string}> | Failed> {
  if (!wallet) return fail('Connect a wallet first', 1008);
  try {
    await sendTransaction(
      wallet,
      [
        'createLobby',
        numOfPlayers,
        units,
        buildings,
        gold,
        initTiles,
        map.join(','),
        TIME_LIMIT,
        ROUND_LIMIT,
      ],
      effectstreamConfig,
      'wait-receipt'
    );
  } catch (err) {
    return fail(`createLobby failed: ${String(err)}`);
  }
  // The server assigns the lobby id; look up the wallet's latest open lobby.
  const latest = await getLatestCreatedLobby(currentAddress());
  if (!latest.success || !latest.data) {
    return fail('createLobby submitted but lobby not found yet');
  }
  return {
    success: true,
    // game reads response.data.lobby_id
    data: {
      lobby_id: latest.data.lobby_id,
      lobbyStatus: latest.data.lobby_state ?? 'open',
    },
  };
}

async function joinLobby(
  lobbyId: string
): Promise<DataResult<unknown> | Failed> {
  if (!wallet) return fail('Connect a wallet first', 1008);
  try {
    await sendTransaction(
      wallet,
      ['joinLobby', lobbyId],
      effectstreamConfig,
      'wait-receipt'
    );
  } catch (err) {
    return fail(`joinLobby failed: ${String(err)}`);
  }
  return await getLobby(lobbyId);
}

async function surrender(
  lobbyId: string
): Promise<DataResult<{lobbyId: string; lobbyStatus: string}> | Failed> {
  if (!wallet) return fail('Connect a wallet first', 1008);
  try {
    await sendTransaction(
      wallet,
      ['surrender', lobbyId],
      effectstreamConfig,
      'wait-receipt'
    );
  } catch (err) {
    return fail(`surrender failed: ${String(err)}`);
  }
  return {success: true, data: {lobbyId, lobbyStatus: 'open'}};
}

// `move` is the comma-joined action mini-language ("A0#0", "0#0#1#-1",
// "surrender"); grammar.ts carries it as a single string.
async function submitMoves(
  lobbyID: string,
  roundNumber: number,
  move: string[]
): Promise<DataResult<{message: string}> | Failed> {
  if (!wallet) return fail('Connect a wallet first', 1008);
  try {
    await sendTransaction(
      wallet,
      ['submitMoves', lobbyID, roundNumber, move.join(',')],
      effectstreamConfig,
      'wait-receipt'
    );
  } catch (err) {
    return fail(`submitMoves failed: ${String(err)}`);
  }
  return {success: true, data: {message: 'OK'}};
}

// ---------------------------------------------------------------------------
// Query endpoints → fetch against packages/node/api.ts routes
// ---------------------------------------------------------------------------

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return await res.json();
}

// GET /lobby/:lobbyId → { ...lobby, gameState, players, rounds }
// The game expects { lobby, players, rounds }, so reshape into a nested lobby.
async function getLobby(
  lobbyId: string
): Promise<DataResult<unknown> | Failed> {
  try {
    const j = await getJson(`/lobby/${lobbyId}`);
    if (!j) return fail('Lobby not found');
    const {players = [], rounds = [], gameState, ...lobby} = j;
    return {success: true, data: {lobby, players, rounds, gameState}};
  } catch (err) {
    return fail(`getLobby failed: ${String(err)}`);
  }
}

// GET /lobby/:lobbyId/map → { lobby_id, map }. The game reads
// `map.data.lobby.map`, so wrap it.
async function getLobbyMap(
  lobbyId: string
): Promise<DataResult<{lobby: {map: string | null}}> | Failed> {
  try {
    const j = await getJson(`/lobby/${lobbyId}/map`);
    if (!j) return fail('Lobby map not found');
    return {success: true, data: {lobby: {map: j.map ?? null}}};
  } catch (err) {
    return fail(`getLobbyMap failed: ${String(err)}`);
  }
}

// GET /lobby/latest/:wallet → latest open lobby row this wallet created.
async function getLatestCreatedLobby(
  walletArg: string | null = null
): Promise<DataResult<any> | Failed> {
  const w = getUserWallet(walletArg);
  if (w.success !== true) return w;
  try {
    const lobby = await getJson(`/lobby/latest/${w.result.toLowerCase()}`);
    return {success: true, data: lobby};
  } catch (err) {
    return fail(`getLatestCreatedLobby failed: ${String(err)}`);
  }
}

// GET /lobby/:lobbyId/state → { lobby_state, current_round }.
async function isGameOver(
  lobbyId: string
): Promise<DataResult<{isGameOver: boolean; current_round: number}> | Failed> {
  try {
    const j = await getJson(`/lobby/${lobbyId}/state`);
    const over =
      j?.lobby_state === 'finished' || j?.lobby_state === 'closed';
    return {
      success: true,
      data: {isGameOver: over, current_round: j?.current_round ?? 0},
    };
  } catch (err) {
    return fail(`isGameOver failed: ${String(err)}`);
  }
}

// GET /lobby/:lobbyId/move/:round → round rows. The game reads the full round
// row off `res.data` (res.data.round / .block_height / .move / .wallet — see
// Moves.deserializePaima), so return the first matching round object (or null).
async function getMoveForRound(
  lobbyId: string,
  round: number
): Promise<DataResult<any | null> | Failed> {
  try {
    const rows = await getJson(`/lobby/${lobbyId}/move/${round}`);
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return {success: true, data: row};
  } catch (err) {
    return fail(`getMoveForRound failed: ${String(err)}`);
  }
}

// GET /lobbies/open → array of open lobbies (the game reads `res.data`).
async function getOpenLobbies(
  _page = 1,
  _count = 100,
  _wallet: string | null = null
): Promise<DataResult<any[]> | Failed> {
  try {
    const lobbies = await getJson(`/lobbies/open`);
    return {success: true, data: Array.isArray(lobbies) ? lobbies : []};
  } catch (err) {
    return fail(`getOpenLobbies failed: ${String(err)}`);
  }
}

// GET /lobbies/my/:wallet → lobbies this wallet created/participates in.
async function getMyGames(
  _page = 1,
  _count = 100,
  walletArg: string | null = null
): Promise<DataResult<any[]> | Failed> {
  const w = getUserWallet(walletArg);
  if (w.success !== true) return w;
  try {
    const lobbies = await getJson(`/lobbies/my/${w.result.toLowerCase()}`);
    return {success: true, data: Array.isArray(lobbies) ? lobbies : []};
  } catch (err) {
    return fail(`getMyGames failed: ${String(err)}`);
  }
}

// GET /leaderboard → players array (the migrated api.ts ranks by wins).
async function getLeaderBoard(
  _wallet: string | null | undefined,
  _type: 'latest' | 'wins' | 'played'
): Promise<DataResult<any[]> | Failed> {
  try {
    const players = await getJson(`/leaderboard?page=0&count=50`);
    return {success: true, data: Array.isArray(players) ? players : []};
  } catch (err) {
    return fail(`getLeaderBoard failed: ${String(err)}`);
  }
}

// Latest processed block height — read straight off the chain via the wallet's
// provider RPC (the original hit the backend's latest_processed_blockheight).
async function getLatestProcessedBlockHeight(): Promise<
  OkResult<number> | Failed
> {
  try {
    const res = await fetch(HARDHAT_RPC, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });
    const j = await res.json();
    return {success: true, result: parseInt(j.result, 16)};
  } catch (err) {
    return fail(`getLatestProcessedBlockHeight failed: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Misc logging shims the game calls (mw.default.exportLogs / pushLog).
// ---------------------------------------------------------------------------

const logs: string[] = [];
function pushLog(message: any, ...optionalParams: any[]) {
  logs.push([message, ...optionalParams].map(String).join(' '));
  // eslint-disable-next-line no-console
  console.log(message, ...optionalParams);
}
function exportLogs(): string {
  return logs.join('\n');
}

// ---------------------------------------------------------------------------
// The endpoints object the game imports as `mw.default`.
// ---------------------------------------------------------------------------

const endpoints = {
  // writes
  createLobby,
  joinLobby,
  surrender,
  submitMoves,
  // queries
  getLobby,
  isGameOver,
  getLobbyMap,
  getLatestCreatedLobby,
  getOpenLobbies,
  getMyGames,
  getMoveForRound,
  getLeaderBoard,
  getUserWallet,
  getLatestProcessedBlockHeight,
  // wallet
  userWalletLogin,
  userWalletLoginWithoutChecks,
  checkWalletStatus,
  connectBrowserWallet,
  connectLocalWallet,
  // misc
  exportLogs,
  pushLog,
};

export default endpoints;
