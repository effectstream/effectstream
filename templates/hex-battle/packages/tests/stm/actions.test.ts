import { assertSQL } from "../helpers.ts";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@hex-battle/contracts-evm";
import type { Client } from "pg";

// Hardhat's well-known accounts #0 and #1.
export const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export const wallet1 = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

function l2Address() {
  return contractAddressesEvmMain()
    .chain31337["EffectstreamL2Module#MyEffectstreamL2"];
}

const publicClient = createPublicClient({ chain: hardhat, transport: http() });

function walletClientFor(account: typeof wallet0) {
  return createWalletClient({ account, chain: hardhat, transport: http() });
}

// Submit a game input via the EffectstreamL2 contract. The sync node's EVM
// primitive parses the JSON payload into a grammar action; the signer's address
// (lowercased) becomes the player wallet.
export function submitInput(action: unknown[], account = wallet0) {
  return walletClientFor(account)
    .writeContract({
      address: l2Address(),
      abi: effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [toHex(JSON.stringify(action))],
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

// A radius-3 hex map (37 tiles) — big enough for the engine to place each
// player's starting units/buildings with spacing.
const MAP =
  "0#0,-1#1,0#1,1#0,1#-1,0#-1,-1#0,-2#2,-1#2,0#2,1#1,2#0,2#-1,2#-2,1#-2,0#-2,-1#-1,-2#0,-2#1,-3#3,-2#3,-1#3,0#3,1#2,2#1,3#0,3#-1,3#-2,3#-3,2#-3,1#-3,0#-3,-1#-2,-2#-1,-3#0,-3#1,-3#2";
// Number of tiles expected on the board (for assertions).
const MAP_TILE_COUNT = 37;

// Lobby ids are generated server-side; discover the latest one for a creator.
async function findLobbyId(
  db: Client,
  creator: string,
  state = "open",
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 25_000) {
    try {
      const res = await db.query(
        `SELECT lobby_id FROM lobby WHERE lobby_creator = $1 AND lobby_state = $2 ORDER BY creation_block_height DESC LIMIT 1`,
        [creator.toLowerCase(), state],
      );
      if (res.rows.length > 0) return res.rows[0].lobby_id;
    } catch { /* table may not be migrated yet — retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ${state} lobby found for creator ${creator}`);
}

// ---------------------------------------------------------------------------
// createLobby — open lobby created, creator joined, hex map persisted, and a
// leaderboard player row created.
// ---------------------------------------------------------------------------
export async function createdLobbyTest(db: Client): Promise<string> {
  await submitInput(
    ["createLobby", 2, "AB", "bF", 100, 4, MAP, 120, 100],
    wallet0,
  );
  const lobbyId = await findLobbyId(db, wallet0.address, "open");

  await assertSQL(
    "createLobby: open lobby created with the creator joined + map persisted",
    db,
    `SELECT l.lobby_id, l.lobby_state, l.num_of_players, l.map, l.units, l.buildings, p.player_wallet
       FROM lobby l JOIN lobby_player p ON l.lobby_id = p.lobby_id
       WHERE l.lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1,
    (res) => {
      const row = res.rows[0] as any;
      // The persisted map must round-trip into 7 {q,r,s} coordinates.
      let coords: any[] = [];
      try {
        coords = JSON.parse(row.map);
      } catch {
        return false;
      }
      return (
        row.lobby_state === "open" &&
        Number(row.num_of_players) === 2 &&
        row.units === "AB" &&
        row.buildings === "bF" &&
        Array.isArray(coords) &&
        coords.length === MAP_TILE_COUNT &&
        coords.every(
          (c) =>
            typeof c.q === "number" &&
            typeof c.r === "number" &&
            c.s === -(c.q + c.r),
        ) &&
        row.player_wallet === wallet0.address.toLowerCase()
      );
    },
  );

  await assertSQL(
    "createLobby: leaderboard player row created for the creator",
    db,
    `SELECT wallet FROM player WHERE wallet = '${wallet0.address.toLowerCase()}'`,
    (res) => res.rows.length >= 1,
    (res) =>
      (res.rows[0] as any).wallet === wallet0.address.toLowerCase(),
  );

  // Reject an invalid lobby (two bases) — must NOT create a lobby for a fresh
  // wallet. (wallet1 hasn't created any lobby yet.)
  await submitInput(
    ["createLobby", 2, "AB", "bb", 100, 4, MAP, 120, 100],
    wallet1,
  );
  await assertSQL(
    "createLobby: invalid buildings (two bases) is rejected — no lobby created",
    db,
    `SELECT COUNT(*) AS c FROM lobby WHERE lobby_creator = '${wallet1.address.toLowerCase()}'`,
    () => true,
    (res) => Number((res.rows[0] as any).c) === 0,
    8_000,
  );

  return lobbyId;
}

// ---------------------------------------------------------------------------
// joinLobby — fills the lobby; the hex game starts (active + serialized board).
// ---------------------------------------------------------------------------
export async function joinedLobbyTest(db: Client, lobbyId: string) {
  await submitInput(["joinLobby", lobbyId], wallet1);

  await assertSQL(
    "joinLobby: lobby becomes active with 2 players",
    db,
    `SELECT lobby_state,
            (SELECT COUNT(*) FROM lobby_player WHERE lobby_id = '${lobbyId}') AS player_count
       FROM lobby WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 && (res.rows[0] as any).lobby_state === "active",
    (res) => {
      const row = res.rows[0] as any;
      return row.lobby_state === "active" && Number(row.player_count) === 2;
    },
  );

  await assertSQL(
    "joinLobby: hex game state is initialized (board tiles + players persisted)",
    db,
    `SELECT game_state FROM lobby WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      (res.rows[0] as any).game_state != null &&
      (res.rows[0] as any).game_state.length > 2,
    (res) => {
      const gs = JSON.parse((res.rows[0] as any).game_state);
      return (
        Array.isArray(gs.map?.tiles) &&
        gs.map.tiles.length === MAP_TILE_COUNT &&
        Array.isArray(gs.players) &&
        gs.players.length === 2 &&
        // every tile carries q/r/s cube coordinates
        gs.map.tiles.every(
          (t: any) =>
            typeof t.q === "number" &&
            typeof t.r === "number" &&
            t.s === -(t.q + t.r),
        ) &&
        // at least one tile is owned by a player (initial positions assigned)
        gs.map.tiles.some((t: any) => t.owner != null)
      );
    },
  );
}

// ---------------------------------------------------------------------------
// submitMoves + zombieScheduledData — advance the board/round.
// ---------------------------------------------------------------------------
export async function submittedMovesTest(db: Client, lobbyId: string) {
  async function snapshot() {
    const res = await db.query(
      `SELECT current_round, game_state FROM lobby WHERE lobby_id = $1`,
      [lobbyId],
    );
    const row = res.rows[0];
    const gs = JSON.parse(row.game_state);
    return {
      round: Number(row.current_round),
      turn: Number(gs.turn),
      currentPlayerIndex: Number(gs.currentPlayerIndex),
      currentWallet: gs.players[Number(gs.currentPlayerIndex)].wallet as string,
    };
  }

  const before = await snapshot();
  const accountFor = (w: string) =>
    w === wallet0.address.toLowerCase() ? wallet0 : wallet1;

  // Best-effort real move: try to build a unit on the center tile (legal only
  // if owned/empty/affordable). Whether or not it lands, the deterministic
  // round-advance below is driven by the zombie timeout.
  const roundsBefore = (
    await db.query(`SELECT COUNT(*) AS c FROM round WHERE lobby_id = $1`, [
      lobbyId,
    ])
  ).rows[0].c;
  await submitInput(
    ["submitMoves", lobbyId, before.round, "A0#0"],
    accountFor(before.currentWallet),
  );

  // zombieScheduledData: deterministically skip the stalled turn → the engine
  // ends the current player's turn, advancing current_round (game.turn). This
  // exercises the hex engine's endTurn() against the live serialized board.
  await submitInput(["zombieScheduledData", lobbyId, before.round, 0]);

  await assertSQL(
    "submitMoves/zombie: the board's round advances (hex engine endTurn applied)",
    db,
    `SELECT current_round FROM lobby WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      Number((res.rows[0] as any).current_round) > before.round,
    (res) => Number((res.rows[0] as any).current_round) > before.round,
    30_000,
  );

  await assertSQL(
    "submitMoves/zombie: a round-history row is recorded for the lobby",
    db,
    `SELECT COUNT(*) AS c FROM round WHERE lobby_id = '${lobbyId}'`,
    (res) => Number((res.rows[0] as any).c) > Number(roundsBefore),
    (res) => Number((res.rows[0] as any).c) > Number(roundsBefore),
    30_000,
  );
}

// ---------------------------------------------------------------------------
// surrender — the current player resigns; with 2 players this ends the game and
// the survivor is recorded as the winner.
// ---------------------------------------------------------------------------
export async function surrenderTest(db: Client) {
  // Fresh lobby played to a surrender end.
  await submitInput(
    ["createLobby", 2, "AB", "bF", 100, 4, MAP, 120, 100],
    wallet0,
  );
  const lobbyId = await findLobbyId(db, wallet0.address, "open");
  await submitInput(["joinLobby", lobbyId], wallet1);

  await assertSQL(
    "surrender setup: lobby active",
    db,
    `SELECT lobby_state FROM lobby WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "active",
    (res) => (res.rows[0] as any).lobby_state === "active",
  );

  // The current player surrenders. Determine who that is from the board.
  const gs = JSON.parse(
    (
      await db.query(`SELECT game_state FROM lobby WHERE lobby_id = $1`, [
        lobbyId,
      ])
    ).rows[0].game_state,
  );
  const currentWallet = gs.players[gs.currentPlayerIndex].wallet as string;
  const account = currentWallet === wallet0.address.toLowerCase()
    ? wallet0
    : wallet1;

  await submitInput(["surrender", lobbyId], account);

  await assertSQL(
    "surrender: game ends — lobby finished/closed with a winner recorded",
    db,
    `SELECT lobby_state, game_winner FROM lobby WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      ((res.rows[0] as any).lobby_state === "finished" ||
        (res.rows[0] as any).lobby_state === "closed"),
    (res) => {
      const row = res.rows[0] as any;
      return (
        (row.lobby_state === "finished" || row.lobby_state === "closed") &&
        row.game_winner != null &&
        row.game_winner !== currentWallet // the survivor, not the resigner
      );
    },
    30_000,
  );

  await assertSQL(
    "surrender: the survivor's leaderboard win is tallied",
    db,
    `SELECT wins FROM player WHERE wallet != '${currentWallet}' AND (wallet = '${wallet0.address.toLowerCase()}' OR wallet = '${wallet1.address.toLowerCase()}')`,
    (res) => res.rows.length >= 1,
    (res) => res.rows.some((r: any) => Number(r.wins) >= 1),
    30_000,
  );
}
