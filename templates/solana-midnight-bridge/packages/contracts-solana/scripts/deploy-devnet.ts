#!/usr/bin/env bun
// Live mode: deploys the bridge to Solana devnet and writes the `solana` section
// of a deployment file (default deployments/devnet.json). Steps:
//   1. `solana program deploy` of build/bridge.so under a FRESH program keypair
//      from the live secrets dir (generated there, mode 600, if absent);
//   2. create a 6-decimal test mint (or use --mint <existing SPL mint>) and
//      Initialize immediately — Initialize is first-caller-wins, so the stored
//      operator is checked right after;
//   3. record a confirmed slot at or before Initialize as the sync start;
//   4. optionally mint test tokens to the live user (solana-user.json);
//   5. write the deployment file. It holds addresses only, never a secret.
//
// Secrets are read ONLY from the live secrets directory, ~/.config/solana-midnight-bridge/
// by default (BRIDGE_SECRETS_DIR overrides it; dir 700, files 600):
//   solana-operator.json        operator = payer = upgrade + mint authority (must be funded)
//   solana-bridge-program.json  program keypair (fresh; generated if missing)
//   solana-user.json            optional; receives --user-tokens test tokens
// The committed local program key and every local dev key are refused (FR-009).
//
// Usage:
//   SOLANA_DEVNET_RPC_URL=<url> bun run scripts/deploy-devnet.ts [--check]
//       [--out <name|path.json>] [--mint <pubkey>] [--user-tokens <n>]
//       [--max-len-multiplier <n>] [--upgrade]
//   --check   run every key, cluster and balance check, then stop (no transaction).
//
// The RPC URL may carry an API key: it is only ever printed or written redacted.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getMint,
} from "@solana/spl-token";
import solanaBin from "@effectstream/solana-node";
import { TEST_MINT_DECIMALS } from "../program-id.ts";
import {
  createAtaIdempotentPrelude,
  createInitializeInstruction,
  deriveBridgeAddresses,
  findConfigAddress,
} from "../instructions.ts";
import { fetchBridgeConfig, sendTx } from "../chain.ts";
import {
  PACKAGE_DIR,
  assertPrivatePermissions,
  checkLiveDeployKeys,
  isLoopbackRpcUrl,
  liveKeyPaths,
  loadLiveKeypair,
  redactRpcUrl,
  writeKeypairFile,
} from "../keys.ts";
import {
  readDeployment,
  writeDeploymentSection,
  type SolanaDeployment,
} from "../deployments.ts";

const DEFAULT_RPC = "https://api.devnet.solana.com";
const SO_PATH = path.join(PACKAGE_DIR, "build", "bridge.so");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const GENESIS = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} as const;

type Args = {
  check: boolean;
  out: string;
  mint?: string;
  userTokens: bigint;
  maxLenMultiplier: number;
  upgrade: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, out: "devnet", userTokens: 100n, maxLenMultiplier: 1, upgrade: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--check": args.check = true; break;
      case "--upgrade": args.upgrade = true; break;
      case "--out": args.out = next(); break;
      case "--mint": args.mint = new PublicKey(next()).toBase58(); break;
      case "--user-tokens": {
        const v = next();
        if (!/^\d+$/.test(v)) throw new Error(`--user-tokens must be a whole number, got ${v}`);
        args.userTokens = BigInt(v);
        break;
      }
      case "--max-len-multiplier": {
        const v = Number(next());
        if (!Number.isInteger(v) || v < 1 || v > 4) throw new Error("--max-len-multiplier must be 1..4");
        args.maxLenMultiplier = v;
        break;
      }
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  return args;
}

const log = (l: string) => console.log(`[deploy-devnet] ${l}`);
const sol = (lamports: number | bigint) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6);

/** The vendored Agave CLI from @effectstream/solana-node (or $SOLANA_CLI). */
async function resolveSolanaCli(): Promise<string> {
  if (process.env.SOLANA_CLI) return process.env.SOLANA_CLI;
  if (!fs.existsSync(solanaBin.path())) {
    log("downloading the vendored Agave release (first use)…");
    await solanaBin.download();
  }
  const cli = path.join(path.dirname(solanaBin.path()), "solana");
  if (!fs.existsSync(cli)) throw new Error(`solana CLI not found next to ${solanaBin.path()}`);
  return cli;
}

/** ProgramData's upgrade authority (bincode: u32 tag=3 | u64 slot | Option<Pubkey>). */
async function upgradeAuthorityOf(conn: Connection, programId: PublicKey): Promise<string | null | undefined> {
  const prog = await conn.getAccountInfo(programId, "confirmed");
  if (!prog) return undefined; // not deployed
  if (!prog.owner.equals(BPF_UPGRADEABLE_LOADER) || prog.data.length < 36 || prog.data.readUInt32LE(0) !== 2) {
    throw new Error(`${programId.toBase58()} exists but is not an upgradeable-loader program account`);
  }
  const programData = new PublicKey(prog.data.subarray(4, 36));
  const pd = await conn.getAccountInfo(programData, "confirmed");
  if (!pd || pd.data.length < 45 || pd.data.readUInt32LE(0) !== 3) {
    throw new Error(`program data ${programData.toBase58()} is missing or malformed`);
  }
  return pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
}

/** Earliest slot touching the config PDA (= its Initialize), for re-runs. */
async function initializeSlot(conn: Connection, programId: PublicKey): Promise<number> {
  const [config] = findConfigAddress(programId);
  let before: string | undefined;
  let oldest = Number.MAX_SAFE_INTEGER;
  for (let page = 0; page < 20; page++) {
    const sigs = await conn.getSignaturesForAddress(config, { before, limit: 1000 }, "confirmed");
    if (sigs.length === 0) break;
    for (const s of sigs) oldest = Math.min(oldest, s.slot);
    before = sigs[sigs.length - 1]!.signature;
    if (sigs.length < 1000) break;
  }
  if (oldest === Number.MAX_SAFE_INTEGER) throw new Error("no signatures found for the bridge config PDA");
  return oldest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rpcUrl = process.env.SOLANA_DEVNET_RPC_URL ?? DEFAULT_RPC;
  log(`rpc ${redactRpcUrl(rpcUrl)}${args.check ? " (--check: no transaction will be sent)" : ""}`);

  // ── keys (never printed) ────────────────────────────────────────────────
  const keys = liveKeyPaths();
  if (!fs.existsSync(keys.dir)) {
    throw new Error(`live secrets dir ${keys.dir} does not exist; create it (mode 700) with solana-operator.json (PR-2 T7.1)`);
  }
  assertPrivatePermissions(keys.dir);
  const operator = loadLiveKeypair(keys.operator, "operator");
  if (!fs.existsSync(keys.program)) {
    if (args.check) {
      log(`program keypair ${keys.program} is absent; a fresh one would be generated (mode 600)`);
    } else {
      writeKeypairFile(keys.program, Keypair.generate());
      log(`generated a fresh program keypair at ${keys.program}`);
    }
  }
  const program = fs.existsSync(keys.program) ? loadLiveKeypair(keys.program, "program") : null;
  checkLiveDeployKeys({
    rpcUrl,
    operator: { file: keys.operator, publicKey: operator.publicKey },
    program: { file: keys.program, publicKey: program?.publicKey ?? Keypair.generate().publicKey },
  });
  log(`operator ${operator.publicKey.toBase58()} · program ${program?.publicKey.toBase58() ?? "(to be generated)"}`);

  // ── cluster ─────────────────────────────────────────────────────────────
  const conn = new Connection(rpcUrl, "confirmed");
  const genesis = await conn.getGenesisHash();
  const cluster =
    genesis === GENESIS.devnet ? "devnet" : genesis === GENESIS.testnet ? "testnet" : genesis === GENESIS.mainnet ? "mainnet-beta" : "unknown";
  if (cluster === "mainnet-beta") throw new Error("refusing to deploy the POC bridge to mainnet-beta");
  if (cluster !== "devnet" && !isLoopbackRpcUrl(rpcUrl)) {
    throw new Error(`expected Solana devnet (genesis ${GENESIS.devnet}), got ${genesis}`);
  }
  log(`cluster ${cluster} (genesis ${genesis}), solana-core ${(await conn.getVersion())["solana-core"]}`);

  // ── program binary and funding ──────────────────────────────────────────
  if (!fs.existsSync(SO_PATH)) throw new Error(`missing ${SO_PATH}; build it with \`bun run build\``);
  const so = fs.readFileSync(SO_PATH);
  log(`program binary ${path.relative(PACKAGE_DIR, SO_PATH)}: ${so.length} B, sha256 ${createHash("sha256").update(so).digest("hex")}`);

  const programId = program?.publicKey;
  const authority = programId ? await upgradeAuthorityOf(conn, programId) : undefined;
  const needsDeploy = authority === undefined || args.upgrade;
  if (authority !== undefined && authority !== operator.publicKey.toBase58()) {
    throw new Error(`program ${programId!.toBase58()} is deployed with upgrade authority ${authority ?? "none"}, not the operator`);
  }
  const maxLen = so.length * args.maxLenMultiplier;
  const rent = async (n: number) => BigInt(await conn.getMinimumBalanceForRentExemption(n));
  const deployPeak = needsDeploy && authority === undefined
    ? (await rent(45 + maxLen)) + (await rent(37 + so.length)) + (await rent(36)) + BigInt((Math.ceil(so.length / 1000) + 4) * 5000)
    : needsDeploy ? (await rent(37 + so.length)) : 0n; // an upgrade needs a buffer only
  const runtime = (await rent(82)) + (await rent(76)) + (await rent(165)) * 2n + 50_000n;
  const needed = deployPeak + runtime;
  const balance = BigInt(await conn.getBalance(operator.publicKey, "confirmed"));
  log(`operator balance ${sol(balance)} SOL; needed ≈ ${sol(needed)} SOL (deploy peak ${sol(deployPeak)} + accounts/fees ${sol(runtime)})`);
  if (balance < needed) {
    throw new Error(
      `operator ${operator.publicKey.toBase58()} needs ≈ ${sol(needed)} SOL on ${cluster}, has ${sol(balance)} (gate G-FUND)`,
    );
  }
  if (args.check) {
    log(`--check passed: would ${needsDeploy ? (authority === undefined ? "deploy" : "upgrade") : "reuse"} the program, then initialize/verify and write ${args.out}`);
    return;
  }

  // ── 1. deploy ───────────────────────────────────────────────────────────
  const signatures: Record<string, string> = {};
  if (needsDeploy) {
    const cli = await resolveSolanaCli();
    const cliArgs = [
      "program", "deploy", SO_PATH,
      "--url", rpcUrl,
      "--keypair", keys.operator,
      "--upgrade-authority", keys.operator,
      "--program-id", keys.program,
      "--commitment", "confirmed",
      "--use-rpc",
      "--output", "json",
    ];
    if (authority === undefined && args.maxLenMultiplier > 1) cliArgs.push("--max-len", String(maxLen));
    log(`solana program deploy (${authority === undefined ? "new" : "upgrade"}) via ${redactRpcUrl(rpcUrl)} …`);
    const res = spawnSync(cli, cliArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (res.status !== 0) {
      // The CLI echoes neither keys nor the URL's secret parts, but redact the URL anyway.
      const scrub = (s: string) => s.split(rpcUrl).join(redactRpcUrl(rpcUrl));
      throw new Error(`solana program deploy failed (exit ${res.status}):\n${scrub(res.stderr ?? "")}\n${scrub(res.stdout ?? "")}`);
    }
    const out = JSON.parse(res.stdout.trim().split("\n").pop() ?? "{}") as { programId?: string; signature?: string };
    if (out.programId !== programId!.toBase58()) {
      throw new Error(`deploy reported program ${out.programId}, expected ${programId!.toBase58()}`);
    }
    if (out.signature) signatures.deploy = out.signature;
    log(`deployed ${out.programId}${out.signature ? ` (${out.signature})` : ""}`);
  } else {
    log(`program ${programId!.toBase58()} already deployed by the operator; not redeploying (pass --upgrade to upgrade)`);
  }
  const finalAuthority = await upgradeAuthorityOf(conn, programId!);
  if (finalAuthority !== operator.publicKey.toBase58()) {
    throw new Error(`after deploy the upgrade authority is ${finalAuthority}, expected the operator`);
  }

  // ── 2./3. mint + initialize (first caller wins) ────────────────────────
  let mint: PublicKey;
  let decimals: number;
  let startSlot: number;
  let createdMint = false;
  const existing = await fetchBridgeConfig(conn, programId!);
  if (existing) {
    if (existing.operator !== operator.publicKey.toBase58()) {
      throw new Error(
        `bridge ${programId!.toBase58()} was initialized by someone else (operator ${existing.operator}). ` +
          `Initialize is first-caller-wins: move ${keys.program} aside and redeploy under a fresh program id.`,
      );
    }
    mint = new PublicKey(existing.mint);
    decimals = (await getMint(conn, mint, "confirmed")).decimals;
    const previous = readDeployment(args.out)?.solana;
    startSlot = previous?.programId === programId!.toBase58() && previous.mint === mint.toBase58()
      ? previous.startSlot
      : await initializeSlot(conn, programId!);
    log(`bridge already initialized by the operator (mint ${mint.toBase58()}); sync start slot ${startSlot}`);
  } else {
    if (args.mint) {
      mint = new PublicKey(args.mint);
      const info = await getMint(conn, mint, "confirmed"); // throws unless a classic SPL mint
      decimals = info.decimals;
      log(`using existing mint ${mint.toBase58()} (${decimals} decimals)`);
    } else {
      const mintKp = Keypair.generate();
      mint = mintKp.publicKey;
      decimals = TEST_MINT_DECIMALS;
      const created = await sendTx(
        conn,
        [
          SystemProgram.createAccount({
            fromPubkey: operator.publicKey,
            newAccountPubkey: mint,
            lamports: Number(await rent(MINT_SIZE)),
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM_ID,
          }),
          createInitializeMint2Instruction(mint, decimals, operator.publicKey, null),
        ],
        [operator, mintKp],
      );
      signatures.createMint = created.signature;
      createdMint = true;
      log(`test mint ${mint.toBase58()} (${decimals} decimals): ${created.signature}`);
    }
    startSlot = await conn.getSlot("confirmed");
    const init = await sendTx(
      conn,
      [createInitializeInstruction({ programId: programId!, payer: operator.publicKey, mint, operator: operator.publicKey })],
      [operator],
    );
    signatures.initialize = init.signature;
    log(`initialized: ${init.signature} (slot ${init.slot})`);
    const stored = await fetchBridgeConfig(conn, programId!);
    if (stored?.operator !== operator.publicKey.toBase58() || stored.mint !== mint.toBase58()) {
      throw new Error(
        `stored config does not name our operator/mint (operator ${stored?.operator}, mint ${stored?.mint}); ` +
          `someone initialized first — redeploy under a fresh program id`,
      );
    }
    log("stored operator and mint verified");
  }

  // ── 4. test tokens for the live user ───────────────────────────────────
  let user: string | undefined;
  if (fs.existsSync(keys.user)) {
    const userKp = loadLiveKeypair(keys.user, "user");
    user = userKp.publicKey.toBase58();
    if (createdMint && args.userTokens > 0n) {
      const prelude = createAtaIdempotentPrelude({ payer: operator.publicKey, owner: userKp.publicKey, mint });
      const amount = args.userTokens * 10n ** BigInt(decimals);
      const minted = await sendTx(
        conn,
        [prelude.instruction, createMintToInstruction(mint, prelude.ata, operator.publicKey, amount)],
        [operator],
      );
      signatures.mintToUser = minted.signature;
      log(`minted ${args.userTokens} test tokens to the user ${user}: ${minted.signature}`);
    }
  }

  // ── 5. deployment file (addresses only) ────────────────────────────────
  const { config, authority: authorityPda, vault } = deriveBridgeAddresses(programId!, mint);
  const deployment: SolanaDeployment = {
    cluster,
    rpcUrl: redactRpcUrl(rpcUrl),
    programId: programId!.toBase58(),
    mint: mint.toBase58(),
    mintDecimals: decimals,
    config: config.toBase58(),
    authority: authorityPda.toBase58(),
    vault: vault.toBase58(),
    operator: operator.publicKey.toBase58(),
    ...(user ? { user } : {}),
    startSlot,
    signatures,
    updatedAt: new Date().toISOString(),
  };
  const file = writeDeploymentSection(args.out, "solana", deployment);
  log(`wrote ${file}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[deploy-devnet] failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
