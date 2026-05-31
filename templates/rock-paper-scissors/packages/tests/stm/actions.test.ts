import { assertSQL } from "../helpers.ts";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@rock-paper-scissors/contracts-evm";
import type { Client } from "pg";

// Hardhat's well-known accounts #0 and #1.
export const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export const wallet1 = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

// Sync node lower-cases signer addresses; compare against these.
export const P1 = wallet0.address.toLowerCase();
export const P2 = wallet1.address.toLowerCase();

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
// primitive parses the JSON payload into a grammar action.
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

// Lobby ids are generated server-side; discover the most recent for a creator.
// Tolerates the user migration (lobbies table) not having been applied yet —
// the sync node applies it at block height 1, which can lag the health check.
async function findLobbyId(
  db: Client,
  creator: string,
  state = "open",
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    try {
      const res = await db.query(
        `SELECT lobby_id FROM lobbies WHERE lobby_creator = $1 AND lobby_state = $2 ORDER BY creation_block_height DESC LIMIT 1`,
        [creator, state],
      );
      if (res.rows.length > 0) return res.rows[0].lobby_id;
    } catch { /* table not migrated yet — retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ${state} lobby found for creator ${creator}`);
}

// Wait until a round's execution_block_height is set (i.e. the round resolved).
async function waitRoundExecuted(
  db: Client,
  lobbyId: string,
  round: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    try {
      const res = await db.query(
        `SELECT execution_block_height FROM rounds WHERE lobby_id = $1 AND round_within_match = $2`,
        [lobbyId, round],
      );
      if (res.rows.length > 0 && res.rows[0].execution_block_height != null) return;
    } catch { /* table not migrated yet — retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Round ${round} of ${lobbyId} did not resolve in time`);
}

// ---------------------------------------------------------------------------
// createdLobby
// ---------------------------------------------------------------------------
export async function createdLobbyTest(db: Client): Promise<string> {
  await submitInput([
    "createdLobby",
    3, // numOfRounds
    100, // roundLength
    false, // isHidden
    false, // isPractice
  ]);
  const lobbyId = await findLobbyId(db, P1, "open");

  await assertSQL(
    "createdLobby: open lobby created by player one with pending match state",
    db,
    `SELECT lobby_state, num_of_rounds, lobby_creator, latest_match_state, current_round
       FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1,
    (res) => {
      const r = res.rows[0] as any;
      return (
        r.lobby_state === "open" &&
        Number(r.num_of_rounds) === 3 &&
        r.lobby_creator === P1 &&
        // 3 rounds x 2 players = 6 pending markers
        r.latest_match_state === "******" &&
        Number(r.current_round) === 0
      );
    },
  );

  return lobbyId;
}

// ---------------------------------------------------------------------------
// joinedLobby — player two joins, lobby becomes active, round 1 opens.
// ---------------------------------------------------------------------------
export async function joinedLobbyTest(db: Client, lobbyId: string) {
  await submitInput(["joinedLobby", lobbyId], wallet1);

  await assertSQL(
    "joinedLobby: lobby becomes active with player two set and round 1 opened",
    db,
    `SELECT l.lobby_state, l.player_two, l.current_round,
            (SELECT COUNT(*) FROM rounds WHERE lobby_id = '${lobbyId}') AS round_count
       FROM lobbies l WHERE l.lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).lobby_state === "active",
    (res) => {
      const r = res.rows[0] as any;
      return (
        r.lobby_state === "active" &&
        r.player_two === P2 &&
        Number(r.current_round) === 1 &&
        Number(r.round_count) === 1
      );
    },
  );

  await assertSQL(
    "joinedLobby: global_user_state rows initialized for both players",
    db,
    `SELECT wallet FROM global_user_state WHERE wallet IN ('${P1}', '${P2}')`,
    (res) => res.rows.length >= 2,
    (res) => res.rows.length >= 2,
  );
}

// ---------------------------------------------------------------------------
// submittedMoves (R|P|S) + best-of-N early termination.
// 3-round, best-of-3: P1 plays Rock, P2 plays Scissors each round. P1 wins
// rounds 1 and 2 → 2 wins > floor(3/2)=1 → game ends EARLY after round 2.
// ---------------------------------------------------------------------------
export async function submittedMovesTest(db: Client, lobbyId: string) {
  // --- Round 1: P1 Rock, P2 Scissors → P1 wins. -----------------------------
  await submitInput(["submittedMoves", lobbyId, 1, "R"], wallet0);
  await assertSQL(
    "submittedMoves: P1's Rock move recorded for round 1",
    db,
    `SELECT move_rps FROM match_moves WHERE lobby_id = '${lobbyId}' AND round = 1 AND wallet = '${P1}'`,
    (res) => res.rows.length >= 1,
    (res) => (res.rows[0] as any).move_rps === "R",
  );

  await submitInput(["submittedMoves", lobbyId, 1, "S"], wallet1);
  await waitRoundExecuted(db, lobbyId, 1);

  await assertSQL(
    "submittedMoves: round 1 resolves with both moves and a P1 win marker",
    db,
    `SELECT latest_match_state, round_winner, current_round FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).round_winner.length >= 1,
    (res) => {
      const r = res.rows[0] as any;
      // After round 1: P1=R, P2=S, rounds 2-3 pending => "RS****"
      return (
        r.latest_match_state === "RS****" &&
        r.round_winner === "1" &&
        Number(r.current_round) === 2
      );
    },
  );

  await assertSQL(
    "submittedMoves: match_moves has 2 rows for round 1 (R and S)",
    db,
    `SELECT move_rps FROM match_moves WHERE lobby_id = '${lobbyId}' AND round = 1 ORDER BY move_rps`,
    (res) => res.rows.length >= 2,
    (res) =>
      (res.rows[0] as any).move_rps === "R" &&
      (res.rows[1] as any).move_rps === "S",
  );

  // --- Round 2: P1 Rock, P2 Scissors → P1 wins again → best-of-3 ends. ------
  await submitInput(["submittedMoves", lobbyId, 2, "R"], wallet0);
  await submitInput(["submittedMoves", lobbyId, 2, "S"], wallet1);
  await waitRoundExecuted(db, lobbyId, 2);

  await assertSQL(
    "submittedMoves: best-of-3 ends early after round 2 (lobby finished)",
    db,
    `SELECT lobby_state, latest_match_state, round_winner FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "finished",
    (res) => {
      const r = res.rows[0] as any;
      // Round 3 never played -> still pending => "RSRS**"
      return (
        r.lobby_state === "finished" &&
        r.latest_match_state === "RSRS**" &&
        r.round_winner === "11"
      );
    },
    40_000,
  );

  await assertSQL(
    "submittedMoves: final_match_state archived with RPSSummary and P1 win",
    db,
    `SELECT player_one_wallet, player_one_result, player_two_result, game_moves
       FROM final_match_state WHERE lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1,
    (res) => {
      const r = res.rows[0] as any;
      return (
        r.player_one_wallet === P1 &&
        r.player_one_result === "win" &&
        r.player_two_result === "loss" &&
        r.game_moves === "RSRS**"
      );
    },
  );

  await assertSQL(
    "submittedMoves: global_user_state tallies P1 win and P2 loss",
    db,
    `SELECT wallet, wins, losses, ties FROM global_user_state WHERE wallet IN ('${P1}', '${P2}') ORDER BY wallet`,
    (res) => res.rows.length >= 2 && res.rows.some((r: any) => Number(r.wins) >= 1),
    (res) => {
      const p1 = res.rows.find((r: any) => r.wallet === P1) as any;
      const p2 = res.rows.find((r: any) => r.wallet === P2) as any;
      return (
        p1 && p2 &&
        Number(p1.wins) >= 1 &&
        Number(p2.losses) >= 1
      );
    },
  );
}

// ---------------------------------------------------------------------------
// closedLobby — create a fresh open lobby and close it.
// ---------------------------------------------------------------------------
export async function closedLobbyTest(db: Client) {
  await submitInput(["createdLobby", 3, 100, false, false]);
  const lobbyId = await findLobbyId(db, P1, "open");

  await submitInput(["closedLobby", lobbyId]);
  await assertSQL(
    "closedLobby: lobby state becomes closed",
    db,
    `SELECT lobby_state FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "closed",
    (res) => (res.rows[0] as any).lobby_state === "closed",
  );
}

// ---------------------------------------------------------------------------
// zombieScheduledData (DID_NOT_PLAY) — only one player submits, then the round
// is forced to resolve. The missing player is marked DID_NOT_PLAY (auto-loss).
// Returns the finished lobby id (used by the userScheduledData test below).
// ---------------------------------------------------------------------------
export async function zombieScheduledDataTest(db: Client): Promise<string> {
  // Fresh 3-round lobby.
  await submitInput(["createdLobby", 3, 100, false, false]);
  const lobbyId = await findLobbyId(db, P1, "open");
  await submitInput(["joinedLobby", lobbyId], wallet1);
  await assertSQL(
    "zombie setup: lobby active and round 1 open",
    db,
    `SELECT lobby_state, current_round FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "active",
    (res) =>
      (res.rows[0] as any).lobby_state === "active" &&
      Number((res.rows[0] as any).current_round) === 1,
  );

  // Only P1 plays round 1; P2 stalls. Then the zombie timer resolves the round.
  await submitInput(["submittedMoves", lobbyId, 1, "R"], wallet0);
  await assertSQL(
    "zombie setup: P1 move recorded, round not yet resolved",
    db,
    `SELECT execution_block_height FROM rounds WHERE lobby_id = '${lobbyId}' AND round_within_match = 1`,
    (res) => res.rows.length >= 1,
    (res) => (res.rows[0] as any).execution_block_height == null,
  );

  await submitInput(["zombieScheduledData", lobbyId]);
  await waitRoundExecuted(db, lobbyId, 1);

  await assertSQL(
    "zombieScheduledData: missing P2 marked DID_NOT_PLAY (R vs -), P1 wins round",
    db,
    `SELECT latest_match_state, round_winner FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).round_winner.length >= 1,
    (res) => {
      const r = res.rows[0] as any;
      // Round 1: P1=R, P2 did-not-play("-") => "R-****", P1 wins => "1"
      return r.latest_match_state === "R-****" && r.round_winner === "1";
    },
  );

  return lobbyId;
}

// ---------------------------------------------------------------------------
// userScheduledData — direct win/loss/tie tally update (scheduled / external).
// ---------------------------------------------------------------------------
export async function userScheduledDataTest(db: Client) {
  // Use a throwaway wallet so the tally is unambiguous.
  const target = "0x000000000000000000000000000000000000beef";
  await submitInput(["userScheduledData", target, "t"]);

  await assertSQL(
    "userScheduledData: global_user_state row created/updated with a tie",
    db,
    `SELECT wins, losses, ties FROM global_user_state WHERE wallet = '${target}'`,
    (res) => res.rows.length >= 1,
    (res) => {
      const r = res.rows[0] as any;
      return Number(r.ties) >= 1 && Number(r.wins) === 0 && Number(r.losses) === 0;
    },
  );
}
