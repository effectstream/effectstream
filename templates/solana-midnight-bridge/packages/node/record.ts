// The deployment record (plan 00058 Interfaces I-3 (c)): the public, secret-free JSON that the
// journey's token registry is generated from. `bun run bridge:record` writes it to a file and the
// node serves the same object at GET /deployment, once it has verified it at start.
//
// Before a record is produced, every field is checked against BOTH chains; any mismatch throws a
// DeploymentRecordError and nothing is written:
//   - the Solana RPC's genesis hash equals the deployment file's `solana.genesisHash` (when set);
//   - the program's config: its stored operator and mint;
//   - the mint's on-chain decimals (getMint) equal the deployment file's;
//   - the contract's sealed `sourceMint`, `operatorKey` and `networkTag`;
//   - the colour, recomputed with the contract's own pure circuit `tokenColor`;
//   - the Midnight network the node targets.
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { fetchBridgeConfig } from "@solana-midnight-bridge/contracts-solana/chain";
import type { SolanaDeployment } from "@solana-midnight-bridge/contracts-solana/deployments";
import { bridgeLedgerReader } from "@solana-midnight-bridge/contracts-midnight/client";
import type { MidnightDeployment } from "@solana-midnight-bridge/contracts-midnight/deploy";
import { networkTagFor, type BridgeMidnightUrls } from "@solana-midnight-bridge/contracts-midnight/network";
import { bytesToHex, hexToBytes, operatorKeyFromSolanaPublicKey, tokenColor } from "@solana-midnight-bridge/contracts-midnight/signing";

export const DEPLOYMENT_RECORD_SCHEMA = "effectstream.solana-midnight-bridge.deployment/1" as const;

export type DeliveryAdapterInfo = { id: string; keySet: string; passportCommit: string };

export type DeploymentRecordV1 = {
  schema: typeof DEPLOYMENT_RECORD_SCHEMA;
  splMint: string;
  splMintDecimals: number;
  name?: string;
  symbol?: string;
  bridgeProgram: string;
  bridgeContract: string;
  colour: string;
  operatorKey: string;
  midnightNetwork: string;
  solanaGenesisHash: string;
  api: string;
  startSlot: number;
  startBlockHeight: number;
  delivery: { adapters: DeliveryAdapterInfo[] };
};

/** What the record needs from the chains (live: liveRecordReads; tests: fakes). */
export type RecordChainReads = {
  genesisHash(): Promise<string>;
  mintDecimals(mint: string): Promise<number>;
  /** The program's config account, or null when it is not initialized. */
  programConfig(programId: string): Promise<{ operator: string; mint: string } | null>;
  /** The contract's sealed values, or null when there is no contract at the address. */
  contractSeals(address: string): Promise<{ sourceMint: Uint8Array; operatorKey: { x: bigint; y: bigint }; networkTag: Uint8Array } | null>;
};

export class DeploymentRecordError extends Error {
  override name = "DeploymentRecordError";
  /** True when the chains may simply not show the deployment YET (not indexed, not initialized). */
  constructor(message: string, readonly transient = false) {
    super(message);
  }
}

/** `--symbol`: 1–8 printable ASCII characters, no space (the 00057 I-1 limit). */
export function checkSymbol(symbol: string): string {
  if (!/^[\x21-\x7e]{1,8}$/.test(symbol)) {
    throw new DeploymentRecordError(`symbol must be 1–8 printable ASCII characters with no space, got ${JSON.stringify(symbol)}`);
  }
  return symbol;
}

/** `--name`: 1–64 printable characters, not starting or ending with a space. */
export function checkName(name: string): string {
  if (!/^[\x20-\x7e]{1,64}$/.test(name) || name.trim() !== name) {
    throw new DeploymentRecordError(`name must be 1–64 printable ASCII characters with no leading or trailing space, got ${JSON.stringify(name)}`);
  }
  return name;
}

/** An http(s) origin: the API's scheme, host and port only. */
export function checkApiOrigin(api: string): string {
  let u: URL;
  try {
    u = new URL(api);
  } catch {
    throw new DeploymentRecordError(`api must be an http(s) URL, got ${JSON.stringify(api)}`);
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash || u.username || u.password) {
    throw new DeploymentRecordError(`api must be an http(s) origin (no path, query or credentials), got ${JSON.stringify(api)}`);
  }
  return u.origin;
}

export type RecordSettings = {
  solana: SolanaDeployment;
  midnight: MidnightDeployment;
  midnightUrls: Pick<BridgeMidnightUrls, "id">;
};

const fail = (m: string): never => {
  throw new DeploymentRecordError(m);
};

/** Builds the record from the deployment file, after checking it against both chains. */
export async function buildDeploymentRecord(
  s: RecordSettings,
  reads: RecordChainReads,
  opts: { api: string; name?: string; symbol?: string; adapters?: DeliveryAdapterInfo[] },
): Promise<DeploymentRecordV1> {
  const { solana, midnight } = s;
  const api = checkApiOrigin(opts.api);
  const name = opts.name === undefined ? undefined : checkName(opts.name);
  const symbol = opts.symbol === undefined ? undefined : checkSymbol(opts.symbol);

  if (midnight.networkId !== s.midnightUrls.id) {
    fail(`the deployment's Midnight network is ${midnight.networkId}, the node targets ${s.midnightUrls.id}`);
  }
  const genesis = await reads.genesisHash();
  if (solana.genesisHash !== undefined && solana.genesisHash !== genesis) {
    fail(`the Solana RPC's genesis hash is ${genesis}, the deployment's is ${solana.genesisHash}`);
  }

  const cfg = await reads.programConfig(solana.programId);
  if (!cfg) throw new DeploymentRecordError(`program ${solana.programId} has no initialized config on this cluster`, true);
  if (cfg!.operator !== solana.operator) fail(`the program's stored operator is ${cfg!.operator}, the deployment's is ${solana.operator}`);
  if (cfg!.mint !== solana.mint) fail(`the program's stored mint is ${cfg!.mint}, the deployment's is ${solana.mint}`);
  const decimals = await reads.mintDecimals(solana.mint);
  if (decimals !== solana.mintDecimals) fail(`mint ${solana.mint} has ${decimals} decimals on chain, the deployment says ${solana.mintDecimals}`);

  const seals = await reads.contractSeals(midnight.contractAddress);
  if (!seals) throw new DeploymentRecordError(`no contract at ${midnight.contractAddress} on Midnight ${midnight.networkId} (not indexed yet?)`, true);
  const mintBytes = new PublicKey(solana.mint).toBytes();
  if (bytesToHex(seals!.sourceMint) !== bytesToHex(mintBytes)) {
    fail(`the contract's sealed sourceMint is ${bytesToHex(seals!.sourceMint)}, the SPL mint's bytes are ${bytesToHex(mintBytes)}`);
  }
  const opKey = operatorKeyFromSolanaPublicKey(new PublicKey(solana.operator).toBytes());
  if (seals!.operatorKey.x !== opKey.x || seals!.operatorKey.y !== opKey.y) {
    fail(`the contract's sealed operatorKey is not the operator ${solana.operator}'s Curve25519 point`);
  }
  const tag = networkTagFor(midnight.networkId);
  if (bytesToHex(seals!.networkTag) !== bytesToHex(tag)) {
    fail(`the contract's sealed networkTag is ${bytesToHex(seals!.networkTag)}, network ${midnight.networkId}'s is ${bytesToHex(tag)}`);
  }
  const colour = bytesToHex(tokenColor(mintBytes, hexToBytes(midnight.contractAddress, 32, "contract address")));
  if (colour !== midnight.tokenColor.toLowerCase()) {
    fail(`the colour does not recompute: tokenColor(mint, contract) is ${colour}, the deployment's is ${midnight.tokenColor}`);
  }

  return {
    schema: DEPLOYMENT_RECORD_SCHEMA,
    splMint: solana.mint,
    splMintDecimals: decimals,
    ...(name !== undefined ? { name } : {}),
    ...(symbol !== undefined ? { symbol } : {}),
    bridgeProgram: solana.programId,
    bridgeContract: midnight.contractAddress.toLowerCase(),
    colour,
    operatorKey: solana.operator,
    midnightNetwork: midnight.networkId,
    solanaGenesisHash: genesis,
    api,
    startSlot: solana.startSlot,
    startBlockHeight: midnight.startBlockHeight,
    delivery: { adapters: opts.adapters ?? [] },
  };
}

/** The live chain reads: the Solana RPC and the Midnight indexer. */
export function liveRecordReads(solanaRpcUrl: string, urls: Pick<BridgeMidnightUrls, "indexer" | "indexerWS">): RecordChainReads {
  const conn = new Connection(solanaRpcUrl, "confirmed");
  const readLedger = bridgeLedgerReader(urls);
  return {
    genesisHash: () => conn.getGenesisHash(),
    mintDecimals: async (mint) => (await getMint(conn, new PublicKey(mint), "confirmed")).decimals,
    programConfig: async (programId) => {
      const c = await fetchBridgeConfig(conn, new PublicKey(programId));
      return c ? { operator: c.operator, mint: c.mint } : null;
    },
    contractSeals: async (address) => {
      const l = await readLedger(address);
      return l
        ? { sourceMint: Uint8Array.from(l.sourceMint), operatorKey: { x: l.operatorKey.x, y: l.operatorKey.y }, networkTag: Uint8Array.from(l.networkTag) }
        : null;
    },
  };
}

/**
 * The node's copy of its record (GET /deployment): verified in the background after start, retried
 * while the chains cannot show the deployment yet (a read error, or not indexed / initialized), and
 * fatal on a mismatch: a node whose deployment file disagrees with the chains must not run.
 */
export function verifyRecordInBackground(o: {
  build: () => Promise<DeploymentRecordV1>;
  retryMs?: number;
  log?: (m: string) => void;
  onMismatch?: (e: DeploymentRecordError) => void;
}): { current: () => DeploymentRecordV1 | null; stop: () => void } {
  let record: DeploymentRecordV1 | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const log = o.log ?? ((m) => console.log(`[bridge-node] ${m}`));
  const onMismatch = o.onMismatch ?? ((e) => {
    console.error(`[bridge-node] the deployment record does not match the chains: ${e.message}; refusing to run`);
    process.exit(1);
  });
  const attempt = async () => {
    if (stopped) return;
    try {
      record = await o.build();
      log(`deployment record verified against both chains (colour ${record.colour})`);
    } catch (e) {
      if (e instanceof DeploymentRecordError && !e.transient) return onMismatch(e);
      log(`deployment record not verified yet (${e instanceof Error ? e.message : String(e)}); retrying`);
      if (!stopped) timer = setTimeout(attempt, o.retryMs ?? 15_000);
    }
  };
  void attempt();
  return {
    current: () => record,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
