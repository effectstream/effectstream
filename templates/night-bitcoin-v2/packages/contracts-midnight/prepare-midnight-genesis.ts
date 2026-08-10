import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  BUNDLED_GENESIS_BLOCK_SHA256,
  BUNDLED_GENESIS_CHAIN_SPEC_SHA256,
  BUNDLED_GENESIS_PROFILE_HASH,
  BUNDLED_GENESIS_STATE_SHA256,
  EXPECTED_NIGHT_PER_UTXO,
  EXPECTED_NIGHT_UTXOS,
  GENESIS_NETWORK,
  GENESIS_NODE_VERSION,
  GENESIS_NONCE_SEED,
  GENESIS_PROFILE_ID,
  GENESIS_SOURCE_NODE_IMAGE,
  GENESIS_SOURCE_TOOLKIT_IMAGE,
  assertUndeployedProfile,
} from "./wallet-profile.ts";

const PACKAGE_DIR = import.meta.dirname;
const PROFILE_PATH = path.join(PACKAGE_DIR, "undeployed-genesis-seeds.json");
const BUNDLED_GENESIS_DIR = path.join(PACKAGE_DIR, "prefunded-genesis");

interface GenesisManifest {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly profileHash: string;
  readonly network: typeof GENESIS_NETWORK;
  readonly nodeVersion: string;
  readonly nonceSeed: string;
  /** Digest-pinned source used to build the checked-in snapshot. */
  readonly nodeImage: string;
  /** Digest-pinned source used to build the checked-in snapshot. */
  readonly toolkitImage: string;
  readonly expectedNightUtxos: number;
  readonly expectedNightPerUtxo: string;
  readonly genesisStateSha256: string;
  readonly genesisBlockSha256: string;
  readonly chainSpecSha256: string;
}

export interface PreparedMidnightGenesis {
  readonly directory: string;
  readonly chainSpecPath: string;
  readonly manifest: GenesisManifest;
}

export interface PrepareMidnightGenesisOptions {
  /** Test-only override; normal launches always verify the checked-in snapshot. */
  readonly bundleDirectory?: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  const file = await lstat(filePath);
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error(`Expected a regular, non-symlink artifact: ${filePath}`);
  }
  return sha256(await readFile(filePath));
}

function artifactPaths(directory: string) {
  return {
    state: path.join(directory, `genesis_state_${GENESIS_NETWORK}.mn`),
    block: path.join(directory, `genesis_block_${GENESIS_NETWORK}.mn`),
    chainSpec: path.join(directory, "chain-spec.json"),
    manifest: path.join(directory, "manifest.json"),
  };
}

async function expectedProfileHash(): Promise<string> {
  const profileBytes = await readFile(PROFILE_PATH);
  return sha256(
    JSON.stringify({
      profileBytes: profileBytes.toString("utf8"),
      profileId: GENESIS_PROFILE_ID,
      network: GENESIS_NETWORK,
      nodeVersion: GENESIS_NODE_VERSION,
      nonceSeed: GENESIS_NONCE_SEED,
      nodeImage: GENESIS_SOURCE_NODE_IMAGE,
      toolkitImage: GENESIS_SOURCE_TOOLKIT_IMAGE,
      expectedNightUtxos: EXPECTED_NIGHT_UTXOS,
      expectedNightPerUtxo: EXPECTED_NIGHT_PER_UTXO.toString(),
    }),
  );
}

function assertLocalChainSpec(value: unknown): void {
  const chainSpec = value as {
    id?: unknown;
    chainType?: unknown;
    bootNodes?: unknown;
  };
  if (
    chainSpec?.id !== "midnight_undeployed" ||
    chainSpec.chainType !== "Local" ||
    !Array.isArray(chainSpec.bootNodes) ||
    chainSpec.bootNodes.length !== 0
  ) {
    throw new Error("bundled chain spec failed undeployed validation");
  }
}

/** Verify the immutable custom-genesis snapshot bundled with Night-Bitcoin. */
export async function prepareMidnightGenesis(
  options: PrepareMidnightGenesisOptions = {},
): Promise<PreparedMidnightGenesis> {
  assertUndeployedProfile(process.env.MIDNIGHT_NETWORK_ID);
  const directory = options.bundleDirectory ?? BUNDLED_GENESIS_DIR;

  try {
    if (!path.isAbsolute(directory)) {
      throw new Error(`bundle path must be absolute: ${directory}`);
    }
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error("bundle is not a regular directory");
    }
    const resolved = await realpath(directory);
    if (resolved !== path.resolve(directory)) {
      throw new Error(`bundle resolves outside its expected path: ${resolved}`);
    }

    const files = artifactPaths(directory);
    const manifestStat = await lstat(files.manifest);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new Error("manifest is not a regular file");
    }
    const manifest = JSON.parse(
      await readFile(files.manifest, "utf8"),
    ) as GenesisManifest;
    const profileHash = await expectedProfileHash();
    if (profileHash !== BUNDLED_GENESIS_PROFILE_HASH) {
      throw new Error("source profile checksum mismatch");
    }
    if (
      manifest.schemaVersion !== 1 ||
      manifest.profileId !== GENESIS_PROFILE_ID ||
      manifest.profileHash !== BUNDLED_GENESIS_PROFILE_HASH ||
      manifest.network !== GENESIS_NETWORK ||
      manifest.nodeVersion !== GENESIS_NODE_VERSION ||
      manifest.nonceSeed !== GENESIS_NONCE_SEED ||
      manifest.nodeImage !== GENESIS_SOURCE_NODE_IMAGE ||
      manifest.toolkitImage !== GENESIS_SOURCE_TOOLKIT_IMAGE ||
      manifest.expectedNightUtxos !== EXPECTED_NIGHT_UTXOS ||
      manifest.expectedNightPerUtxo !== EXPECTED_NIGHT_PER_UTXO.toString() ||
      manifest.genesisStateSha256 !== BUNDLED_GENESIS_STATE_SHA256 ||
      manifest.genesisBlockSha256 !== BUNDLED_GENESIS_BLOCK_SHA256 ||
      manifest.chainSpecSha256 !== BUNDLED_GENESIS_CHAIN_SPEC_SHA256
    ) {
      throw new Error("manifest metadata mismatch");
    }

    const [stateHash, blockHash, chainSpecHash, chainSpecJson] =
      await Promise.all([
        sha256File(files.state),
        sha256File(files.block),
        sha256File(files.chainSpec),
        readFile(files.chainSpec, "utf8"),
      ]);
    if (
      stateHash !== BUNDLED_GENESIS_STATE_SHA256 ||
      blockHash !== BUNDLED_GENESIS_BLOCK_SHA256 ||
      chainSpecHash !== BUNDLED_GENESIS_CHAIN_SPEC_SHA256
    ) {
      throw new Error("artifact checksum mismatch");
    }
    assertLocalChainSpec(JSON.parse(chainSpecJson));

    return {
      directory,
      chainSpecPath: files.chainSpec,
      manifest,
    };
  } catch (error) {
    throw new Error(
      `Refusing invalid bundled Midnight genesis at ${directory}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (import.meta.main) {
  const prepared = await prepareMidnightGenesis();
  console.log(
    `Verified bundled ${GENESIS_PROFILE_ID}: ${prepared.chainSpecPath}`,
  );
}
