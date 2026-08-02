import { assert, assertSQL } from "@e2e/engine";
import type { Client } from "pg";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import {
  MINTED_AMOUNT,
  WATCHED_MINT,
  WATCHED_MINT_DECIMALS,
  WATCHED_TOKEN_ACCOUNT,
  WATCHED_TOKEN_OWNER,
} from "../config.ts";

const RPC = "http://localhost:8899";

/**
 * Phase 1 on-chain setup for the SOLANA:TokenAccount primitive: create the mint the
 * config watches, open the owner's associated token account, and mint into it.
 *
 * The mint and owner come from fixed seeds because the config is static and cannot
 * name a runtime-generated address. The first assertion re-derives them and checks
 * they match `config.ts`, so changing a seed fails here rather than silently leaving
 * the primitive watching a mint nothing ever touches.
 */
export async function runTokenAccountSetup(): Promise<void> {
  const connection = new Connection(RPC, "confirmed");
  const mintKeypair = Keypair.fromSeed(new Uint8Array(32).fill(8));
  const ownerKeypair = Keypair.fromSeed(new Uint8Array(32).fill(9));
  // Pays rent and fees for the setup. Not the owner, so the owner's ATA balance
  // reflects only the mint.
  const payer = Keypair.generate();

  await assert(
    "Solana: fixed seeds still derive the mint and owner the config watches",
    async () => {
      return mintKeypair.publicKey.toBase58() === WATCHED_MINT &&
        ownerKeypair.publicKey.toBase58() === WATCHED_TOKEN_OWNER;
    },
  );

  await assert("Solana: airdrop funds the token setup payer", async () => {
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");
    return (await connection.getBalance(payer.publicKey, "confirmed")) > 0;
  });

  await assert("Solana: creates the watched SPL mint", async () => {
    const mint = await createMint(
      connection,
      payer,
      // Payer is the mint authority; the owner only ever receives.
      payer.publicKey,
      null,
      WATCHED_MINT_DECIMALS,
      mintKeypair,
    );
    return mint.toBase58() === WATCHED_MINT;
  });

  await assert("Solana: opens the owner's associated token account", async () => {
    const ata = await createAssociatedTokenAccount(
      connection,
      payer,
      mintKeypair.publicKey,
      ownerKeypair.publicKey,
    );
    // Cross-check against the independently derived address, so a change in how
    // the ATA is derived surfaces here rather than as a missing row later.
    const derived = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      ownerKeypair.publicKey,
    );
    return ata.toBase58() === WATCHED_TOKEN_ACCOUNT &&
      derived.toBase58() === WATCHED_TOKEN_ACCOUNT;
  });

  await assert("Solana: mints the watched amount to the owner's ATA", async () => {
    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      ownerKeypair.publicKey,
    );
    await mintTo(
      connection,
      payer,
      mintKeypair.publicKey,
      ata,
      payer,
      BigInt(MINTED_AMOUNT),
    );
    const account = await getAccount(connection, ata);
    return account.amount === BigInt(MINTED_AMOUNT) &&
      account.mint.toBase58() === WATCHED_MINT &&
      account.owner.toBase58() === WATCHED_TOKEN_OWNER;
  });

  console.log("Solana token account setup passed.\n");
}

/**
 * Real sync-pipeline assertion for SOLANA:TokenAccount: the mintTo above appears in
 * the block's `meta.postTokenBalances`, the primitive resolves its `accountIndex`
 * against the resolved account list, and the state machine writes it to
 * `solana_token_events`.
 *
 * Asserts on the state-machine table rather than `primitive_accounting`, so a
 * primitive that produced accounting rows but never reached the STM still fails.
 */
export async function runTokenAccountTest(db: Client): Promise<void> {
  await assertSQL<{
    count: number;
    amount: string | null;
    owner: string | null;
    decimals: number | null;
  }>(
    "Solana: sync captured the watched SPL balance into solana_token_events",
    db,
    `SELECT COUNT(*)::int AS count, MAX(amount) AS amount, MAX(owner) AS owner, MAX(decimals) AS decimals
FROM solana_token_events WHERE token_account = '${WATCHED_TOKEN_ACCOUNT}' AND mint = '${WATCHED_MINT}';`,
    (res) => (res.rows[0]?.count ?? 0) >= 1,
    (res) =>
      (res.rows[0]?.count ?? 0) >= 1 &&
      res.rows[0]?.amount === MINTED_AMOUNT &&
      res.rows[0]?.owner === WATCHED_TOKEN_OWNER &&
      Number(res.rows[0]?.decimals) === WATCHED_MINT_DECIMALS,
  );

  // The mint authority's own account touches the same mint during setup, and the
  // primitive is narrowed by owner — so nothing but the watched owner may appear.
  await assertSQL<{ count: number }>(
    "Solana: no token events for an owner the primitive does not watch",
    db,
    `SELECT COUNT(*)::int AS count FROM solana_token_events WHERE owner <> '${WATCHED_TOKEN_OWNER}';`,
    (res) => res.rows.length >= 1,
    (res) => (res.rows[0]?.count ?? 0) === 0,
  );

  console.log("Solana token account sync test passed.\n");
}
