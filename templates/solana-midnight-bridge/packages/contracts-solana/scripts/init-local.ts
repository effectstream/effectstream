#!/usr/bin/env bun
// Local mode only (run by start.dev.ts after the validator is up):
//   1. create a 6-decimal test mint (mint authority = local operator);
//   2. initialize the bridge with the local operator;
//   3. mint 1,000 test tokens to the local dev user;
//   4. write the `solana` section of deployments/local.json.
//
// Idempotent: on a validator that was not reset, an existing bridge config is
// reused when its operator is the local operator.
//
// Keys: keypair/local-operator.json and keypair/local-user.json (gitignored,
// generated on first use). They are dev keys, so this script refuses any RPC
// that is not local (FR-009). It never prints secret key bytes.
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAccount,
} from "@solana/spl-token";
import { LOCAL_BRIDGE_PROGRAM_ID, TEST_MINT_DECIMALS } from "../program-id.ts";
import {
  createAtaIdempotentPrelude,
  createInitializeInstruction,
  deriveBridgeAddresses,
} from "../instructions.ts";
import { airdropAtLeast, fetchBridgeConfig, sendTx } from "../chain.ts";
import {
  assertLocalRpc,
  loadLocalOperator,
  loadLocalUser,
  redactRpcUrl,
} from "../keys.ts";
import {
  readDeployment,
  writeDeploymentSection,
  type SolanaDeployment,
} from "../deployments.ts";
import {
  DEV_SOLANA_RPC_URL,
  DEV_USER_TEST_TOKENS,
  LOCAL_DEPLOYMENT,
} from "../dev-config.ts";

export type InitLocalOptions = {
  rpcUrl?: string;
  /** Deployment file name or path (default `local`). */
  deployment?: string;
  log?: (line: string) => void;
};

export type InitLocalResult = {
  deployment: SolanaDeployment;
  file: string;
  operator: Keypair;
  user: Keypair;
  /** True when this call initialized the bridge (false: reused an existing config). */
  initialized: boolean;
};

async function tokenBalance(conn: Connection, account: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, account, "confirmed")).amount;
  } catch {
    return 0n;
  }
}

export async function initLocal(opts: InitLocalOptions = {}): Promise<InitLocalResult> {
  const log = opts.log ?? ((l: string) => console.log(`[init-local] ${l}`));
  const rpcUrl = opts.rpcUrl ?? DEV_SOLANA_RPC_URL;
  const deploymentName = opts.deployment ?? LOCAL_DEPLOYMENT;
  assertLocalRpc(rpcUrl, "init-local");

  const conn = new Connection(rpcUrl, "confirmed");
  const programId = new PublicKey(LOCAL_BRIDGE_PROGRAM_ID);
  const program = await conn.getAccountInfo(programId, "confirmed");
  if (!program?.executable) {
    throw new Error(
      `bridge program ${programId.toBase58()} is not loaded on ${redactRpcUrl(rpcUrl)}; ` +
        `start the validator with \`bun run chain:start\` (it preloads build/bridge.so)`,
    );
  }

  const operator = loadLocalOperator();
  const user = loadLocalUser();
  log(`operator ${operator.publicKey.toBase58()} · dev user ${user.publicKey.toBase58()}`);
  await airdropAtLeast(conn, operator.publicKey, 10);
  await airdropAtLeast(conn, user.publicKey, 2);

  const signatures: Record<string, string> = {};
  let mint: PublicKey;
  let startSlot: number;
  let initialized = false;

  const existing = await fetchBridgeConfig(conn, programId);
  if (existing) {
    if (existing.operator !== operator.publicKey.toBase58()) {
      throw new Error(
        `bridge ${programId.toBase58()} is already initialized with operator ${existing.operator}, ` +
          `not the local operator; restart the validator with a fresh ledger (SOLANA_RESET=true)`,
      );
    }
    mint = new PublicKey(existing.mint);
    const previous = readDeployment(deploymentName)?.solana;
    startSlot =
      previous && previous.programId === programId.toBase58() && previous.mint === mint.toBase58()
        ? previous.startSlot
        : 0;
    log(`bridge already initialized (mint ${mint.toBase58()}); reusing it, sync start slot ${startSlot}`);
  } else {
    // Any slot at or before Initialize works as the sync start.
    startSlot = await conn.getSlot("confirmed");
    const mintKp = Keypair.generate();
    mint = mintKp.publicKey;
    const rent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
    const created = await sendTx(
      conn,
      [
        SystemProgram.createAccount({
          fromPubkey: operator.publicKey,
          newAccountPubkey: mint,
          lamports: rent,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint, TEST_MINT_DECIMALS, operator.publicKey, null),
      ],
      [operator, mintKp],
    );
    signatures.createMint = created.signature;
    log(`test mint ${mint.toBase58()} (${TEST_MINT_DECIMALS} decimals): ${created.signature}`);

    const init = await sendTx(
      conn,
      [
        createInitializeInstruction({
          programId,
          payer: operator.publicKey,
          mint,
          operator: operator.publicKey,
        }),
      ],
      [operator],
    );
    signatures.initialize = init.signature;
    initialized = true;
    log(`bridge initialized: ${init.signature} (slot ${init.slot})`);

    const stored = await fetchBridgeConfig(conn, programId);
    if (stored?.operator !== operator.publicKey.toBase58() || stored.mint !== mint.toBase58()) {
      throw new Error(`stored bridge config does not match: ${JSON.stringify(stored, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    }
  }

  // Top the dev user up to the test-token target.
  const unit = 10n ** BigInt(TEST_MINT_DECIMALS);
  const target = DEV_USER_TEST_TOKENS * unit;
  const prelude = createAtaIdempotentPrelude({ payer: operator.publicKey, owner: user.publicKey, mint });
  const have = await tokenBalance(conn, prelude.ata);
  if (have < target) {
    const minted = await sendTx(
      conn,
      [
        prelude.instruction,
        createMintToInstruction(mint, prelude.ata, operator.publicKey, target - have),
      ],
      [operator],
    );
    signatures.mintToUser = minted.signature;
    log(`minted ${(target - have) / unit} test tokens to the dev user (${prelude.ata.toBase58()}): ${minted.signature}`);
  } else {
    log(`dev user already holds ${have / unit} test tokens`);
  }

  const { config, authority, vault } = deriveBridgeAddresses(programId, mint);
  const deployment: SolanaDeployment = {
    cluster: "localnet",
    rpcUrl: redactRpcUrl(rpcUrl),
    programId: programId.toBase58(),
    mint: mint.toBase58(),
    mintDecimals: TEST_MINT_DECIMALS,
    config: config.toBase58(),
    authority: authority.toBase58(),
    vault: vault.toBase58(),
    operator: operator.publicKey.toBase58(),
    user: user.publicKey.toBase58(),
    startSlot,
    genesisHash: await conn.getGenesisHash(),
    signatures,
    updatedAt: new Date().toISOString(),
  };
  const file = writeDeploymentSection(deploymentName, "solana", deployment);
  log(`wrote ${file}`);
  return { deployment, file, operator, user, initialized };
}

if (import.meta.main) {
  initLocal().then(
    () => process.exit(0),
    (e) => {
      console.error(`[init-local] failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
