// Deploy the Midnight bridge contract and write the `midnight` section of the
// deployment file.
//
//   bun run deploy.ts                       local devnet → deployments/local.json
//   bun run deploy.ts --mode stagenet       stagenet     → deployments/devnet-stagenet.json
//   bun run deploy.ts --out <name|path>     another deployment file (e.g. a 2nd bridge for tests)
//   bun run deploy.ts --force               deploy even if the recorded contract still exists
//
// Needs the `solana` section first (init-local.ts locally, deploy-devnet.ts
// live): the contract seals the SPL mint (its colour domain) and the operator's
// Solana Ed25519 key, which must authorize every mint (Q8 A).
//
// Constructor arguments:
//   operatorKey = curve25519FromProjective(ed25519.Point.fromBytes(operator pubkey))
//   sourceMint  = the SPL mint's 32 bytes
//   networkTag  = sha256("midnight:" + networkId)        (network.ts)
//
// Provers: the engine's `deployMidnightContract` with the wallet facade on the
// DUST prover (`proofServer`) and the contract providers on the rc.8 prover
// (`contractProofServer`, engine E2). The wallet is built here with
// `buildWalletFacade` (never `buildWalletAndWaitForFunds`), and
// `deployMidnightContract` stops it when it returns.
//
// The deployment file holds addresses and heights only, never a secret.
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { deployMidnightContract } from "@effectstream/midnight-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  deploymentPath,
  readDeployment,
  requireSolanaDeployment,
  writeDeploymentSection,
} from "@solana-midnight-bridge/contracts-solana/deployments";
import {
  BridgeContract,
  CONTRACT_NAME,
  CONTRACTS_BASE_DIR,
} from "./contract.ts";
import {
  midnightUrls,
  networkTagFor,
  parseMidnightMode,
  type BridgeMidnightMode,
  type BridgeMidnightUrls,
} from "./network.ts";
import { bytesToHex, operatorKeyFromSolanaPublicKey, tokenColor } from "./signing.ts";
import { buildBridgeWallet, resolveSeed } from "./wallets.ts";

export type MidnightDeployment = {
  networkId: string;
  contractAddress: string;
  /** Bridge colour (shielded token type), 32-byte hex. */
  tokenColor: string;
  /** SPL mint the contract custodies (32-byte hex) — must equal solana.mint. */
  sourceMint: string;
  networkTag: string;
  /** The operator's Solana public key (base58) and its Curve25519 point. */
  operator: string;
  operatorKey: { x: string; y: string };
  /** Sync start: an indexer block height at or before the deploy transaction. */
  startBlockHeight: number;
  /** protocol//host only. */
  indexer: string;
  updatedAt: string;
};

const DEFAULT_DEPLOYMENT: Record<BridgeMidnightMode, string> = {
  local: "local",
  stagenet: "devnet-stagenet",
};

const LOCAL_STORAGE_PASSWORD = "BridgeLocalDevOnly-1!";

const log = (...a: unknown[]) => console.log("[deploy-midnight]", ...a);

function host(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "<unparseable>";
  }
}

export async function latestIndexerHeight(indexer: string): Promise<number> {
  const res = await fetch(indexer, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "query { block { height } }" }),
  });
  if (!res.ok) throw new Error(`indexer ${host(indexer)} answered ${res.status}`);
  const j = (await res.json()) as { data?: { block?: { height?: number } } };
  const h = j.data?.block?.height;
  if (typeof h !== "number") throw new Error(`indexer ${host(indexer)} returned no block height`);
  return h;
}

/** GET <prover>/version, or null when unreachable. */
export async function proverVersion(url: string): Promise<string | null> {
  try {
    const res = await fetch(new URL("/version", url), { signal: AbortSignal.timeout(5_000) });
    return res.ok ? (await res.text()).trim() : null;
  } catch {
    return null;
  }
}

/** Refuses a prover layout that cannot work: one prover for both, or the wrong contract prover. */
export async function checkProvers(urls: BridgeMidnightUrls): Promise<{ dust: string; contract: string }> {
  if (urls.proofServer.replace(/\/$/, "") === urls.contractProofServer.replace(/\/$/, "")) {
    throw new Error(
      "the DUST prover and the contract prover are the same URL; the mint needs 9.0.0-rc.8 and DUST needs a dust/9 prover (rc.5/rc.6)",
    );
  }
  const [dust, contract] = await Promise.all([
    proverVersion(urls.proofServer),
    proverVersion(urls.contractProofServer),
  ]);
  if (!dust) throw new Error(`DUST prover ${urls.proofServer} is not reachable`);
  if (!contract) throw new Error(`contract prover ${urls.contractProofServer} is not reachable`);
  if (!contract.includes("9.0.0-rc.8")) {
    throw new Error(`contract prover ${urls.contractProofServer} is ${contract}; mintFromSolana needs 9.0.0-rc.8`);
  }
  if (dust.includes("9.0.0-rc.8")) {
    throw new Error(`DUST prover ${urls.proofServer} is rc.8 (dust/10); stagenet DUST needs rc.5/rc.6 (dust/9)`);
  }
  return { dust, contract };
}

export type DeployOptions = {
  mode: BridgeMidnightMode;
  /** Deployment file name or path (default per mode). */
  out?: string;
  /** Deploy even when the recorded contract still exists on chain. */
  force?: boolean;
  /** Wallet seed file (default: the dev seed locally, ~/.config/effectstream-00050/midnight-operator.seed live). */
  seedFile?: string;
};

/** Deploys (or reuses) the bridge contract and writes the `midnight` section. */
export async function deployBridge(opts: DeployOptions): Promise<MidnightDeployment> {
  const out = opts.out ?? DEFAULT_DEPLOYMENT[opts.mode];
  const urls = midnightUrls(opts.mode);
  const solana = requireSolanaDeployment(out);
  const sourceMint = new PublicKey(solana.mint).toBytes();
  const operatorPubkey = new PublicKey(solana.operator).toBytes();
  const operatorKey = operatorKeyFromSolanaPublicKey(operatorPubkey);
  const networkTag = networkTagFor(urls.id);
  log(`mode ${opts.mode}, network ${urls.id}, indexer ${host(urls.indexer)}, deployment ${deploymentPath(out)}`);
  log(`solana mint ${solana.mint}, operator ${solana.operator}`);

  // Reuse a recorded contract that still exists with the same seals.
  const previous = readDeployment(out)?.midnight as MidnightDeployment | undefined;
  if (
    !opts.force && previous?.contractAddress && previous.networkId === urls.id &&
    previous.sourceMint === bytesToHex(sourceMint) && previous.operator === solana.operator &&
    previous.networkTag === bytesToHex(networkTag)
  ) {
    const pdp = indexerPublicDataProvider(urls.indexer, urls.indexerWS);
    const state = await pdp.queryContractState(previous.contractAddress).catch(() => null);
    if (state) {
      log(`contract ${previous.contractAddress} already deployed with these seals; reusing it (--force redeploys)`);
      return previous;
    }
    log(`recorded contract ${previous.contractAddress} is not on this chain (fresh devnet?); deploying a new one`);
  }

  const provers = await checkProvers(urls);
  log(`provers: DUST ${host(urls.proofServer)} = ${provers.dust}; contract ${host(urls.contractProofServer)} = ${provers.contract}`);

  if (!process.env.MIDNIGHT_STORAGE_PASSWORD) {
    if (opts.mode !== "local") {
      throw new Error("set MIDNIGHT_STORAGE_PASSWORD (16+ chars) for a live deploy");
    }
    process.env.MIDNIGHT_STORAGE_PASSWORD = LOCAL_STORAGE_PASSWORD;
  }

  const seed = resolveSeed(opts.mode, "operator", urls, opts.seedFile);
  const startBlockHeight = Math.max(1, (await latestIndexerHeight(urls.indexer)) - 1);
  log(`sync start block height ${startBlockHeight}`);

  log("building the operator wallet (facade proves DUST on the DUST prover)...");
  const walletResult = await buildBridgeWallet(urls, seed);
  const t0 = Date.now();
  // deployMidnightContract stops walletResult in its finally block.
  const contractAddress = await deployMidnightContract(
    {
      contractName: CONTRACT_NAME,
      contractClass: BridgeContract,
      baseDir: CONTRACTS_BASE_DIR,
      deployArgs: [operatorKey, sourceMint, networkTag],
      privateStateStoreName: `bridge-${urls.id}`,
      witnesses: {},
    },
    {
      id: urls.id,
      indexer: urls.indexer,
      indexerWS: urls.indexerWS,
      node: urls.node,
      proofServer: urls.proofServer,
      contractProofServer: urls.contractProofServer,
    },
    undefined,
    { walletResult },
  );
  log(`deployed ${contractAddress} in ${Date.now() - t0} ms`);

  const color = tokenColor(sourceMint, Uint8Array.from(Buffer.from(contractAddress, "hex")));
  const deployment: MidnightDeployment = {
    networkId: urls.id,
    contractAddress,
    tokenColor: bytesToHex(color),
    sourceMint: bytesToHex(sourceMint),
    networkTag: bytesToHex(networkTag),
    operator: solana.operator,
    operatorKey: { x: operatorKey.x.toString(), y: operatorKey.y.toString() },
    startBlockHeight,
    indexer: host(urls.indexer),
    updatedAt: new Date().toISOString(),
  };
  const file = writeDeploymentSection(out, "midnight", deployment);
  log(`wrote the midnight section of ${file}: colour ${deployment.tokenColor}`);
  return deployment;
}

function parseArgs(argv: string[]): DeployOptions {
  const o: DeployOptions = { mode: "local" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--mode": o.mode = parseMidnightMode(next()); break;
      case "--out": o.out = next(); break;
      case "--seed-file": o.seedFile = next(); break;
      case "--force": o.force = true; break;
      default: throw new Error(`unknown argument ${a}`);
    }
  }
  return o;
}

if (import.meta.main) {
  try {
    await deployBridge(parseArgs(process.argv.slice(2)));
    process.exit(0);
  } catch (e) {
    console.error("[deploy-midnight] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
