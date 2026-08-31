import { assertSQL } from "../helpers.ts";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@trading-cards/contracts-evm";
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

// The two players in the lobby tests.
export const CREATOR_NFT = 1;
export const JOINER_NFT = 2;
export const TRADE_NFT = 10;

// ---------------------------------------------------------------------------
// accountMint + tradeNftMint
// ---------------------------------------------------------------------------
export async function mintNftTest(db: Client) {
  // wallet0 owns account NFT 1; wallet1 owns account NFT 2.
  await submitInput(["accountMint", CREATOR_NFT], wallet0);
  await submitInput(["accountMint", JOINER_NFT], wallet1);
  // wallet0 mints a trade NFT.
  await submitInput(["tradeNftMint", TRADE_NFT], wallet0);

  await assertSQL(
    "accountMint: nft_ownership records both minted account NFTs",
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
    "accountMint: global_user_state initialized with zeroed stats",
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

  await assertSQL(
    "tradeNftMint: card_trade_nft row created (empty)",
    db,
    `SELECT nft_id, cards FROM card_trade_nft WHERE nft_id = ${TRADE_NFT}`,
    (res) => res.rows.length >= 1,
    (res) => (res.rows[0] as any).cards == null,
  );
}

// ---------------------------------------------------------------------------
// buyCardPack
// ---------------------------------------------------------------------------
export async function buyCardPackTest(db: Client) {
  await submitInput(["buyCardPack"], wallet0); // bought by wallet0's NFT (1)

  await assertSQL(
    "buyCardPack: a card_packs row is recorded for the buyer NFT",
    db,
    `SELECT id, buyer_nft_id, card_registry_ids FROM card_packs WHERE buyer_nft_id = ${CREATOR_NFT}`,
    (res) => res.rows.length >= 1,
    (res) =>
      Array.isArray((res.rows[0] as any).card_registry_ids) &&
      (res.rows[0] as any).card_registry_ids.length === 5,
  );

  await assertSQL(
    "buyCardPack: 5 cards owned by the buyer NFT are inserted",
    db,
    `SELECT COUNT(*) AS c FROM cards WHERE owner_nft_id = ${CREATOR_NFT}`,
    (res) => Number((res.rows[0] as any).c) >= 5,
    (res) => Number((res.rows[0] as any).c) >= 5,
  );
}

// ---------------------------------------------------------------------------
// setTradeNftCards — assign two owned cards to the (empty) trade NFT.
// ---------------------------------------------------------------------------
export async function setTradeNftCardsTest(db: Client) {
  // Grab two card ids owned by the creator NFT.
  const cardsRes = await db.query(
    `SELECT id FROM cards WHERE owner_nft_id = $1 ORDER BY id LIMIT 2`,
    [CREATOR_NFT],
  );
  const cardIds = cardsRes.rows.map((r: any) => Number(r.id));
  if (cardIds.length < 2) throw new Error("setTradeNftCardsTest: not enough cards owned");

  await submitInput(["setTradeNftCards", TRADE_NFT, cardIds], wallet0);

  await assertSQL(
    "setTradeNftCards: trade NFT gets the assigned cards",
    db,
    `SELECT cards FROM card_trade_nft WHERE nft_id = ${TRADE_NFT}`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).cards != null,
    (res) => {
      const cards = (res.rows[0] as any).cards as number[];
      return Array.isArray(cards) &&
        cards.length === 2 &&
        cardIds.every((id) => cards.map(Number).includes(id));
    },
  );

  await assertSQL(
    "setTradeNftCards: assigned cards are unassigned from the owner",
    db,
    `SELECT COUNT(*) AS c FROM cards WHERE id IN (${cardIds.join(",")}) AND owner_nft_id IS NULL`,
    (res) => Number((res.rows[0] as any).c) === 2,
    (res) => Number((res.rows[0] as any).c) === 2,
  );
}

// ---------------------------------------------------------------------------
// createdLobby
// ---------------------------------------------------------------------------
export async function createdLobbyTest(db: Client): Promise<string> {
  await submitInput(
    [
      "createdLobby",
      CREATOR_NFT,
      "", // creatorCommitments
      3, // numOfRounds
      100, // turnLength
      false, // isHidden
      false, // isPractice
    ],
    wallet0,
  );
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

  await assertSQL(
    "createdLobby: open lobby created with the creator joined",
    db,
    `SELECT l.lobby_id, l.lobby_state, l.num_of_rounds, p.nft_id, p.hit_points
       FROM lobbies l JOIN lobby_player p ON l.lobby_id = p.lobby_id
       WHERE l.lobby_id = '${lobbyId}'`,
    (res) => res.rows.length >= 1,
    (res) =>
      (res.rows[0] as any).lobby_state === "open" &&
      Number((res.rows[0] as any).num_of_rounds) === 3 &&
      Number((res.rows[0] as any).nft_id) === CREATOR_NFT &&
      Number((res.rows[0] as any).hit_points) === 4,
  );

  return lobbyId;
}

// ---------------------------------------------------------------------------
// joinedLobby — fills the lobby and starts the match.
// ---------------------------------------------------------------------------
export async function joinedLobbyTest(db: Client, lobbyId: string) {
  await submitInput(["joinedLobby", JOINER_NFT, lobbyId, ""], wallet1);

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
    "joinedLobby: both players have a turn assigned (0 and 1) and a starting deck",
    db,
    `SELECT turn, cardinality(current_deck) AS deck_size FROM lobby_player WHERE lobby_id = '${lobbyId}' ORDER BY turn`,
    (res) => res.rows.length === 2 && res.rows.every((r: any) => r.turn != null),
    (res) =>
      Number((res.rows[0] as any).turn) === 0 &&
      Number((res.rows[1] as any).turn) === 1 &&
      res.rows.every((r: any) => Number(r.deck_size) === 10),
  );
}

// ---------------------------------------------------------------------------
// submittedMoves (card play): play a card, then play out the match.
// ---------------------------------------------------------------------------
export async function submittedMovesTest(db: Client, lobbyId: string) {
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

  // 1) The turn player ends their turn: they draw their opening hand. The turn
  //    rotates to the other player.
  const first = await turnInfo();
  await submitInput(
    ["submittedMoves", first.nftId, lobbyId, first.match, first.round, "end"],
    accountFor(first.nftId),
  );
  await assertSQL(
    "submittedMoves: ending a turn rotates the turn to the other player",
    db,
    `SELECT current_turn FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) =>
      res.rows.length >= 1 &&
      Number((res.rows[0] as any).current_turn) !== first.turn,
    (res) => Number((res.rows[0] as any).current_turn) !== first.turn,
  );

  // 2) A move row was recorded for that player.
  await assertSQL(
    "submittedMoves: a round_move row is recorded for the move",
    db,
    `SELECT COUNT(*) AS c FROM round_move WHERE lobby_id = '${lobbyId}' AND nft_id = ${first.nftId}`,
    (res) => Number((res.rows[0] as any).c) >= 1,
    (res) => Number((res.rows[0] as any).c) >= 1,
  );

  // 3) The new turn player plays a card from hand onto their board, then both
  //    players keep ending turns until someone's HP runs out / rounds exhaust.
  async function lobbyState(): Promise<{ state: string; round: number; turn: number }> {
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

  // Play one card to exercise the play path + board update.
  const second = await turnInfo();
  await submitInput(
    ["submittedMoves", second.nftId, lobbyId, second.match, second.round, "play+0+0"],
    accountFor(second.nftId),
  );
  await assertSQL(
    "submittedMoves: playing a card puts a card on the player's board",
    db,
    `SELECT cardinality(current_board) AS board_size FROM lobby_player WHERE lobby_id = '${lobbyId}' AND nft_id = ${second.nftId}`,
    (res) => res.rows.length >= 1 && Number((res.rows[0] as any).board_size) >= 1,
    (res) => Number((res.rows[0] as any).board_size) >= 1,
  );

  // 4) Drive the match to completion with end-turn moves.
  for (let i = 0; i < 30; i++) {
    const snap = await lobbyState();
    if (snap.state === "finished") break;
    const t = await turnInfo();
    await submitInput(
      ["submittedMoves", t.nftId, lobbyId, t.match, t.round, "end"],
      accountFor(t.nftId),
    );
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
    60_000,
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
  await submitInput(
    ["createdLobby", CREATOR_NFT, "", 2, 100, false, false],
    wallet0,
  );
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

  await submitInput(["closedLobby", lobbyId], wallet0);
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
  // Create a practice lobby and have the practice bot (nft 0) join to start it.
  await submitInput(
    ["createdLobby", CREATOR_NFT, "", 3, 100, false, true],
    wallet0,
  );
  const lobbyId = await findLobbyId(db, CREATOR_NFT, "open");

  await submitInput(["joinedLobby", 0, lobbyId, ""], wallet0);
  await assertSQL(
    "practice lobby becomes active once filled",
    db,
    `SELECT lobby_state FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (res) => (res.rows[0] as any)?.lobby_state === "active",
    (res) => (res.rows[0] as any).lobby_state === "active",
  );

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
    // Creator (nft 1) ends their turn to hand the turn to the bot.
    await submitInput(
      ["submittedMoves", CREATOR_NFT, lobbyId, info.match, info.round, "end"],
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

  // practiceMoves: the bot auto-plays a move on its turn — a move row is
  // recorded for nft 0.
  await submitInput(["practiceMoves", lobbyId, info.match, info.round]);
  await assertSQL(
    "practiceMoves: a move row is recorded for the practice bot",
    db,
    `SELECT COUNT(*) AS c FROM round_move WHERE lobby_id = '${lobbyId}' AND nft_id = 0`,
    (res) => Number((res.rows[0] as any).c) >= 1,
    (res) => Number((res.rows[0] as any).c) >= 1,
  );

  // zombieScheduledData: forces the stalled player's turn to advance (only if
  // the lobby is still active — a finished lobby has no turn to rotate).
  const lobbyNow = await db.query(
    `SELECT lobby_state, current_turn FROM lobbies WHERE lobby_id = $1`,
    [lobbyId],
  );
  if (lobbyNow.rows[0].lobby_state === "active") {
    const turn0 = Number(lobbyNow.rows[0].current_turn);
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
  } else {
    console.log(
      "  [TEST] zombieScheduledData — [SKIP] (practice match already finished)",
    );
  }
}
