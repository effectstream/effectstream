import { assertSQL } from "../helpers.ts";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@dice/contracts-evm";
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

const annotatedMintNftAbi = [
  {
    inputs: [
      { name: "_to", type: "address" },
      { name: "initialData", type: "string" },
    ],
    name: "mint",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function l2Address() {
  return contractAddressesEvmMain()
    .chain31337["EffectstreamL2Module#MyEffectstreamL2"];
}
function nftAddress() {
  return contractAddressesEvmMain().chain31337["AccountNft#AnnotatedMintNft"];
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

// Mint an account NFT to `to`. Account #0 is the contract owner, so it can mint
// directly (no sale-proxy purchase needed for tests). The ERC721 primitive
// observes the Transfer event and routes it to the `nftMint` transition.
export function mintNft(to: `0x${string}`, account = wallet0) {
  return walletClientFor(account)
    .writeContract({
      address: nftAddress(),
      abi: annotatedMintNftAbi,
      functionName: "mint",
      args: [to, ""],
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

// --- Lobby ids are generated server-side; discover them from the DB. -------
async function findLobbyId(
  db: Client,
  creatorNftId: number,
  state = "open",
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    const res = await db.query(
      `SELECT lobby_id FROM lobbies WHERE lobby_creator = $1 AND lobby_state = $2 ORDER BY creation_block_height DESC LIMIT 1`,
      [creatorNftId, state],
    );
    if (res.rows.length > 0) return res.rows[0].lobby_id;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ${state} lobby found for creator ${creatorNftId}`);
}

// ---------------------------------------------------------------------------
// nftMint
// ---------------------------------------------------------------------------
// The first two mints (token ids 1 and 2) are reused as the two players in the
// lobby tests below.
export const CREATOR_NFT = 1;
export const JOINER_NFT = 2;

export async function mintNftTest(db: Client) {
  await mintNft(wallet0.address); // token 1 -> wallet0
  await mintNft(wallet1.address); // token 2 -> wallet1

  await assertSQL(
    "nftMint: nft_ownership records both minted tokens",
    db,
    `SELECT nft_id, wallet_address FROM nft_ownership WHERE nft_id IN (${CREATOR_NFT}, ${JOINER_NFT}) ORDER BY nft_id`,
    (res) => res.rows.length >= 2,
    (res) =>
      Number((res.rows[0] as any).nft_id) === CREATOR_NFT &&
      (res.rows[0] as any).wallet_address === wallet0.address.toLowerCase() &&
      Number((res.rows[1] as any).nft_id) === JOINER_NFT &&
      (res.rows[1] as any).wallet_address === wallet1.address.toLowerCase(),
  );

  await assertSQL(
    "nftMint: global_user_state initialized with zeroed stats",
    db,
    `SELECT nft_id, wins, losses, ties FROM global_user_state WHERE nft_id IN (${CREATOR_NFT}, ${JOINER_NFT}) ORDER BY nft_id`,
    (res) => res.rows.length >= 2,
    (res) =>
      res.rows.every(
        (r: any) =>
          Number(r.wins) === 0 &&
          Number(r.losses) === 0 &&
          Number(r.ties) === 0,
      ),
  );
}

// ---------------------------------------------------------------------------
// createdLobby
// ---------------------------------------------------------------------------
export async function createdLobbyTest(db: Client): Promise<string> {
  await submitInput([
    "createdLobby",
    CREATOR_NFT,
    3, // numOfRounds
    100, // roundLength
    100, // playTimePerPlayer
    false, // isHidden
    false, // isPractice
  ]);
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

  await assertSQL(
    "createdLobby: open lobby created with the creator joined",
    db,
    `SELECT l.lobby_id, l.lobby_state, l.num_of_rounds, p.nft_id
       FROM lobbies l JOIN lobby_player p ON l.lobby_id = p.lobby_id
       WHERE l.lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1,
    (res) =>
      (res.rows[0] as any).lobby_state === "open" &&
      Number((res.rows[0] as any).num_of_rounds) === 3 &&
      Number((res.rows[0] as any).nft_id) === CREATOR_NFT,
  );

  return lobbyId;
}

// ---------------------------------------------------------------------------
// joinedLobby — fills the lobby and starts the match.
// ---------------------------------------------------------------------------
export async function joinedLobbyTest(db: Client, lobbyId: string) {
  await submitInput(["joinedLobby", JOINER_NFT, lobbyId], wallet1);

  await assertSQL(
    "joinedLobby: lobby becomes active with 2 players and a match row",
    db,
    `SELECT lobby_state, current_match, current_round, current_turn,
            (SELECT COUNT(*) FROM lobby_player WHERE lobby_id = '${lobbyId}') AS player_count,
            (SELECT COUNT(*) FROM lobby_match WHERE lobby_id = '${lobbyId}') AS match_count
       FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).lobby_state === "active",
    (res) => {
      const row = res.rows[0] as any;
      return (
        row.lobby_state === "active" &&
        Number(row.player_count) === 2 &&
        Number(row.match_count) === 1 &&
        Number(row.current_match) === 0 &&
        Number(row.current_round) === 0 &&
        row.current_turn != null
      );
    },
  );

  await assertSQL(
    "joinedLobby: both players have a turn assigned (0 and 1)",
    db,
    `SELECT turn FROM lobby_player WHERE lobby_id = '${lobbyId}' ORDER BY turn`,
    (res) => res.rows.length === 2 && res.rows.every((r: any) => r.turn != null),
    (res) =>
      Number((res.rows[0] as any).turn) === 0 &&
      Number((res.rows[1] as any).turn) === 1,
  );
}

// ---------------------------------------------------------------------------
// submittedMoves (+ tick): play out a full match and verify the stat tally.
// ---------------------------------------------------------------------------
export async function submittedMovesTest(db: Client, lobbyId: string) {
  // Helper: who is the NFT whose turn it currently is?
  async function turnInfo(): Promise<{
    nftId: number;
    round: number;
    match: number;
    turn: number;
  }> {
    const res = await db.query(
      `SELECT p.nft_id, l.current_turn, l.current_round, l.current_match
         FROM lobbies l JOIN lobby_player p ON l.lobby_id = p.lobby_id
         WHERE l.lobby_id = $1 AND p.turn = l.current_turn`,
      [lobbyId],
    );
    const row = res.rows[0];
    return {
      nftId: Number(row.nft_id),
      round: Number(row.current_round),
      match: Number(row.current_match),
      turn: Number(row.current_turn),
    };
  }
  const accountFor = (nftId: number) =>
    nftId === CREATOR_NFT ? wallet0 : wallet1;

  // 1) The turn player rolls once: their score should increase (2..12).
  const first = await turnInfo();
  await submitInput(
    ["submittedMoves", first.nftId, lobbyId, first.match, first.round, true],
    accountFor(first.nftId),
  );
  await assertSQL(
    "submittedMoves: rolling accumulates score for the turn player",
    db,
    `SELECT score FROM lobby_player WHERE lobby_id = '${lobbyId}' AND nft_id = ${first.nftId}`,
    (res) => res.rows.length >= 1 && Number((res.rows[0] as any).score) >= 2,
    (res) => {
      const s = Number((res.rows[0] as any).score);
      return s >= 2 && s <= 12;
    },
  );

  // 2) The same player passes: turn rotates to the other player.
  await submitInput(
    ["submittedMoves", first.nftId, lobbyId, first.match, first.round, false],
    accountFor(first.nftId),
  );
  await assertSQL(
    "submittedMoves: passing rotates the turn to the other player",
    db,
    `SELECT current_turn FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      Number((res.rows[0] as any).current_turn) !== first.turn,
    (res) => Number((res.rows[0] as any).current_turn) !== first.turn,
  );

  // 3) Play the match to completion: each player passes until the match ends.
  //    With 3 rounds and both players passing each round, every round ties
  //    (no rolls → score 0 → both equidistant from 21), the match resolves and
  //    the lobby moves to "finished" with stats tallied.
  //
  //    Each pass either rotates the turn or (when it closes a round) advances
  //    current_round / finishes the match. We submit one pass, then wait for the
  //    DB to actually reflect that move before reading the next turn — otherwise
  //    a stale read would resubmit against an already-consumed turn/round, which
  //    the STM rejects (turn/round mismatch) and the match would stall.
  async function lobbyState(): Promise<
    { state: string; round: number; turn: number }
  > {
    const res = await db.query(
      `SELECT lobby_state, current_round, current_turn FROM lobbies WHERE lobby_id = $1`,
      [lobbyId],
    );
    const r = res.rows[0];
    return {
      state: r.lobby_state,
      round: Number(r.current_round),
      turn: Number(r.current_turn),
    };
  }

  for (let i = 0; i < 12; i++) {
    const snap = await lobbyState();
    if (snap.state === "finished") break;
    const t = await turnInfo();
    await submitInput(
      ["submittedMoves", t.nftId, lobbyId, t.match, t.round, false],
      accountFor(t.nftId),
    );
    // Wait until this pass is reflected: state finished, or round advanced, or
    // the turn rotated.
    const startWait = Date.now();
    while (Date.now() - startWait < 15_000) {
      const now = await lobbyState();
      if (
        now.state === "finished" ||
        now.round !== snap.round ||
        now.turn !== snap.turn
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await assertSQL(
    "submittedMoves: match reaches finished state",
    db,
    `SELECT lobby_state FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "finished",
    (res) => (res.rows[0] as any).lobby_state === "finished",
    40_000,
  );

  await assertSQL(
    "submittedMoves: global_user_state win/loss/tie tallied for both players",
    db,
    `SELECT nft_id, wins, losses, ties FROM global_user_state WHERE nft_id IN (${CREATOR_NFT}, ${JOINER_NFT})`,
    (res) => res.rows.length >= 2,
    (res) =>
      res.rows.every(
        (r: any) =>
          Number(r.wins) + Number(r.losses) + Number(r.ties) >= 1,
      ),
  );
}

// ---------------------------------------------------------------------------
// closedLobby — create a fresh lobby and close it.
// ---------------------------------------------------------------------------
export async function closedLobbyTest(db: Client) {
  await submitInput([
    "createdLobby",
    CREATOR_NFT,
    2,
    100,
    100,
    false,
    false,
  ]);
  // Find the most-recent open lobby (the one just created).
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

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
// practiceMoves + zombieScheduledData
// ---------------------------------------------------------------------------
export async function practiceAndZombieTest(db: Client) {
  // Create a practice lobby (isPractice = true). A practice lobby starts the
  // match as soon as the creator + practice bot fill it. We mimic the practice
  // flow: create + the bot (nft 0) joins to start the match.
  await submitInput([
    "createdLobby",
    CREATOR_NFT,
    2,
    100,
    100,
    false,
    true, // isPractice
  ]);
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

  // The practice bot (nft 0) joins to fill the lobby and start the match.
  await submitInput(["joinedLobby", 0, lobbyId]);
  await assertSQL(
    "practice lobby becomes active once filled",
    db,
    `SELECT lobby_state, current_match, current_round FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "active",
    (res) => (res.rows[0] as any).lobby_state === "active",
  );

  // The practice bot only plays on its turn. Turn order is assigned randomly at
  // match start, so first ensure it's the bot's (nft 0) turn — if the human
  // creator (nft 1) is up, have them pass to rotate the turn to the bot.
  async function botTurnInfo() {
    const res = await db.query(
      `SELECT l.current_match, l.current_round, l.current_turn,
              (SELECT turn FROM lobby_player WHERE lobby_id = l.lobby_id AND nft_id = 0) AS bot_turn
         FROM lobbies l WHERE l.lobby_id = $1`,
      [lobbyId],
    );
    const r = res.rows[0];
    return {
      match: Number(r.current_match),
      round: Number(r.current_round),
      currentTurn: Number(r.current_turn),
      botTurn: Number(r.bot_turn),
    };
  }

  let info = await botTurnInfo();
  if (info.currentTurn !== info.botTurn) {
    // Creator (nft 1) passes to hand the turn to the bot.
    await submitInput(
      ["submittedMoves", CREATOR_NFT, lobbyId, info.match, info.round, false],
      wallet0,
    );
    await assertSQL(
      "practice setup: turn handed to the practice bot",
      db,
      `SELECT current_turn FROM lobbies WHERE lobby_id = '${lobbyId}'`,
      (res) =>
        res.rows.length >= 1 &&
        Number((res.rows[0] as any).current_turn) === info.botTurn,
      (res) => Number((res.rows[0] as any).current_turn) === info.botTurn,
    );
    info = await botTurnInfo();
  }

  // practiceMoves: the bot auto-plays a move (roll or pass) on its turn — a move
  // row is recorded for nft 0.
  await submitInput(["practiceMoves", lobbyId, info.match, info.round]);
  await assertSQL(
    "practiceMoves: a move row is recorded for the practice bot",
    db,
    `SELECT COUNT(*) AS c FROM round_move WHERE lobby_id = '${lobbyId}' AND nft_id = 0`,
    (res) => Number((res.rows[0] as any).c) >= 1,
    (res) => Number((res.rows[0] as any).c) >= 1,
  );

  // zombieScheduledData: forces the stalled player's turn to advance. We read
  // the turn just before submitting the zombie input, then poll until it
  // actually changes (the `waitUntil` gate ensures we don't read the value
  // before the zombie input propagates). The practice lobby has more than one
  // round, so it is still "active" here — zombie just rotates the turn.
  const turnBefore = await db.query(
    `SELECT current_turn FROM lobbies WHERE lobby_id = $1`,
    [lobbyId],
  );
  const turn0 = Number(turnBefore.rows[0].current_turn);
  await submitInput(["zombieScheduledData", lobbyId]);
  await assertSQL(
    "zombieScheduledData: current turn advances (timeout auto-progress)",
    db,
    `SELECT current_turn FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      Number((res.rows[0] as any).current_turn) !== turn0,
    (res) => Number((res.rows[0] as any).current_turn) !== turn0,
  );
}
