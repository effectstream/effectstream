import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  EXPECTED_NIGHT_PER_UTXO,
  EXPECTED_NIGHT_UTXOS,
  GENESIS_NETWORK,
  GENESIS_NODE_VERSION,
  GENESIS_NONCE_SEED,
  GENESIS_PROFILE_ID,
  MIDNIGHT_NODE_IMAGE,
  MIDNIGHT_TOOLKIT_IMAGE,
  assertUndeployedProfile,
} from "./wallet-profile.ts";

const PACKAGE_DIR = import.meta.dirname;
const PROFILE_PATH = path.join(PACKAGE_DIR, "undeployed-genesis-seeds.json");
const CACHE_ROOT = path.join(PACKAGE_DIR, ".midnight-genesis");
const DOCKER_MAX_BUFFER = 32 * 1024 * 1024;

const CONFIG_FILES = [
  "ledger-parameters-config.json",
  "cnight-config.json",
  "ics-config.json",
  "reserve-config.json",
] as const;

interface GenesisManifest {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly profileHash: string;
  readonly network: typeof GENESIS_NETWORK;
  readonly nodeVersion: string;
  readonly nonceSeed: string;
  readonly nodeImage: string;
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
  readonly cacheHit: boolean;
}

export interface PrepareMidnightGenesisOptions {
  /** Test-only override; normal launches always use the package-local cache. */
  readonly cacheRoot?: string;
  /** Injectable command boundary used by cache/manifest unit tests. */
  readonly dockerRunner?: DockerRunner;
}

export type DockerRunner = (
  args: readonly string[],
  options?: { captureStdout?: boolean },
) => string;

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

async function assertSafeCacheRoot(cacheRoot: string): Promise<void> {
  if (!path.isAbsolute(cacheRoot)) {
    throw new Error(`Midnight genesis cache root must be absolute: ${cacheRoot}`);
  }
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const cacheRootStat = await lstat(cacheRoot);
  if (!cacheRootStat.isDirectory() || cacheRootStat.isSymbolicLink()) {
    throw new Error(`Refusing unsafe Midnight genesis cache root: ${cacheRoot}`);
  }
  const resolved = await realpath(cacheRoot);
  if (resolved !== path.resolve(cacheRoot)) {
    throw new Error(`Midnight genesis cache resolves outside its expected path: ${resolved}`);
  }
}

function dockerUserArgs(): string[] {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") {
    return [];
  }
  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

function runDocker(
  args: readonly string[],
  options: { captureStdout?: boolean } = {},
): string {
  const captureStdout = options.captureStdout ?? false;
  const result = spawnSync("docker", [...args], {
    encoding: captureStdout ? "utf8" : undefined,
    maxBuffer: DOCKER_MAX_BUFFER,
    stdio: captureStdout ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw new Error(
      `Docker is required to prepare ${GENESIS_PROFILE_ID}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Docker command failed while preparing ${GENESIS_PROFILE_ID} (exit ${result.status ?? "unknown"})`,
    );
  }
  return captureStdout ? String(result.stdout) : "";
}

function artifactPaths(directory: string) {
  return {
    state: path.join(directory, `genesis_state_${GENESIS_NETWORK}.mn`),
    block: path.join(directory, `genesis_block_${GENESIS_NETWORK}.mn`),
    chainSpec: path.join(directory, "chain-spec.json"),
    manifest: path.join(directory, "manifest.json"),
  };
}

async function readVerifiedCache(
  directory: string,
  profileHash: string,
): Promise<PreparedMidnightGenesis | null> {
  const files = artifactPaths(directory);
  try {
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error("cache entry is not a regular directory");
    }
    const manifestStat = await lstat(files.manifest);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new Error("manifest is not a regular file");
    }
    const manifest = JSON.parse(
      await readFile(files.manifest, "utf8"),
    ) as GenesisManifest;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.profileId !== GENESIS_PROFILE_ID ||
      manifest.profileHash !== profileHash ||
      manifest.network !== GENESIS_NETWORK ||
      manifest.nodeVersion !== GENESIS_NODE_VERSION ||
      manifest.nonceSeed !== GENESIS_NONCE_SEED ||
      manifest.nodeImage !== MIDNIGHT_NODE_IMAGE ||
      manifest.toolkitImage !== MIDNIGHT_TOOLKIT_IMAGE ||
      manifest.expectedNightUtxos !== EXPECTED_NIGHT_UTXOS ||
      manifest.expectedNightPerUtxo !== EXPECTED_NIGHT_PER_UTXO.toString()
    ) {
      throw new Error("manifest metadata mismatch");
    }

    const [stateHash, blockHash, chainSpecHash] = await Promise.all([
      sha256File(files.state),
      sha256File(files.block),
      sha256File(files.chainSpec),
    ]);
    if (
      stateHash !== manifest.genesisStateSha256 ||
      blockHash !== manifest.genesisBlockSha256 ||
      chainSpecHash !== manifest.chainSpecSha256
    ) {
      throw new Error("artifact checksum mismatch");
    }

    JSON.parse(await readFile(files.chainSpec, "utf8"));
    return {
      directory,
      chainSpecPath: files.chainSpec,
      manifest,
      cacheHit: true,
    };
  } catch (error) {
    try {
      await access(directory);
    } catch {
      return null;
    }
    throw new Error(
      `Refusing invalid Midnight genesis cache at ${directory}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function generateArtifacts(
  buildDirectory: string,
  dockerRunner: DockerRunner,
): Promise<void> {
  const configDirectory = path.join(buildDirectory, "config");
  await mkdir(configDirectory, { recursive: true });

  dockerRunner([
    "run",
    "--rm",
    ...dockerUserArgs(),
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--entrypoint",
    "/bin/cp",
    "--mount",
    `type=bind,src=${configDirectory},dst=/output`,
    MIDNIGHT_NODE_IMAGE,
    ...CONFIG_FILES.map((file) => `/res/dev/${file}`),
    "/output/",
  ]);

  dockerRunner([
    "run",
    "--rm",
    ...dockerUserArgs(),
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,size=2g",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--entrypoint",
    "/midnight-node-toolkit",
    "--workdir",
    "/tmp",
    "--env",
    "MN_FETCH_CACHE=inmemory",
    "--env",
    "MN_LEDGER_CACHE_DB=",
    "--env",
    "MIDNIGHT_PP=/tmp/zk-params",
    "--mount",
    `type=bind,src=${PROFILE_PATH},dst=/profile/seeds.json,readonly`,
    "--mount",
    `type=bind,src=${configDirectory},dst=/config,readonly`,
    "--mount",
    `type=bind,src=${buildDirectory},dst=/output`,
    MIDNIGHT_TOOLKIT_IMAGE,
    "--quiet",
    "generate-genesis",
    "--network",
    GENESIS_NETWORK,
    "--nonce-seed",
    GENESIS_NONCE_SEED,
    "--seeds-file",
    "/profile/seeds.json",
    "--ledger-parameters-config",
    "/config/ledger-parameters-config.json",
    "--cnight-generates-dust-config",
    "/config/cnight-config.json",
    "--ics-config",
    "/config/ics-config.json",
    "--reserve-config",
    "/config/reserve-config.json",
    "--unshielded-mint-amount",
    EXPECTED_NIGHT_PER_UTXO.toString(),
    "--unshielded-num-funding-outputs",
    EXPECTED_NIGHT_UTXOS.toString(),
    "--shielded-mint-amount",
    EXPECTED_NIGHT_PER_UTXO.toString(),
    "--shielded-num-funding-outputs",
    EXPECTED_NIGHT_UTXOS.toString(),
    "--out-dir",
    "/output",
  ]);

  const chainSpecJson = dockerRunner(
    [
      "run",
      "--rm",
      ...dockerUserArgs(),
      "--read-only",
      "--tmpfs",
      "/tmp:rw,exec,size=512m",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--entrypoint",
      "/midnight-node",
      "--env",
      "CFG_PRESET=dev",
      "--env",
      `CHAINSPEC_GENESIS_STATE=/custom/genesis_state_${GENESIS_NETWORK}.mn`,
      "--env",
      `CHAINSPEC_GENESIS_BLOCK=/custom/genesis_block_${GENESIS_NETWORK}.mn`,
      "--mount",
      `type=bind,src=${buildDirectory},dst=/custom,readonly`,
      MIDNIGHT_NODE_IMAGE,
      "build-spec",
      "--disable-default-bootnode",
    ],
    { captureStdout: true },
  );

  const chainSpec = JSON.parse(chainSpecJson) as {
    id?: unknown;
    chainType?: unknown;
    bootNodes?: unknown;
  };
  if (
    chainSpec.id !== "midnight_undeployed" ||
    chainSpec.chainType !== "Local" ||
    !Array.isArray(chainSpec.bootNodes) ||
    chainSpec.bootNodes.length !== 0
  ) {
    throw new Error("Generated Midnight chain spec failed undeployed validation");
  }
  await writeFile(path.join(buildDirectory, "chain-spec.json"), chainSpecJson, {
    mode: 0o600,
  });
}

/** Prepare or reuse immutable custom-genesis artifacts for Night-Bitcoin. */
export async function prepareMidnightGenesis(
  options: PrepareMidnightGenesisOptions = {},
): Promise<PreparedMidnightGenesis> {
  assertUndeployedProfile(process.env.MIDNIGHT_NETWORK_ID);
  const cacheRoot = options.cacheRoot ?? CACHE_ROOT;
  const dockerRunner = options.dockerRunner ?? runDocker;

  const profileBytes = await readFile(PROFILE_PATH);
  const profileHash = sha256(
    JSON.stringify({
      profileBytes: profileBytes.toString("utf8"),
      profileId: GENESIS_PROFILE_ID,
      network: GENESIS_NETWORK,
      nodeVersion: GENESIS_NODE_VERSION,
      nonceSeed: GENESIS_NONCE_SEED,
      nodeImage: MIDNIGHT_NODE_IMAGE,
      toolkitImage: MIDNIGHT_TOOLKIT_IMAGE,
      expectedNightUtxos: EXPECTED_NIGHT_UTXOS,
      expectedNightPerUtxo: EXPECTED_NIGHT_PER_UTXO.toString(),
    }),
  );
  const finalDirectory = path.join(cacheRoot, profileHash.slice(0, 20));

  await assertSafeCacheRoot(cacheRoot);
  const cached = await readVerifiedCache(finalDirectory, profileHash);
  if (cached) return cached;

  const buildDirectory = await mkdtemp(path.join(cacheRoot, ".building-"));
  try {
    await generateArtifacts(buildDirectory, dockerRunner);
    const files = artifactPaths(buildDirectory);
    const manifest: GenesisManifest = {
      schemaVersion: 1,
      profileId: GENESIS_PROFILE_ID,
      profileHash,
      network: GENESIS_NETWORK,
      nodeVersion: GENESIS_NODE_VERSION,
      nonceSeed: GENESIS_NONCE_SEED,
      nodeImage: MIDNIGHT_NODE_IMAGE,
      toolkitImage: MIDNIGHT_TOOLKIT_IMAGE,
      expectedNightUtxos: EXPECTED_NIGHT_UTXOS,
      expectedNightPerUtxo: EXPECTED_NIGHT_PER_UTXO.toString(),
      genesisStateSha256: await sha256File(files.state),
      genesisBlockSha256: await sha256File(files.block),
      chainSpecSha256: await sha256File(files.chainSpec),
    };
    await writeFile(files.manifest, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });

    try {
      await rename(buildDirectory, finalDirectory);
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        throw error;
      }
      await rm(buildDirectory, { recursive: true, force: true });
      const winner = await readVerifiedCache(finalDirectory, profileHash);
      if (!winner) throw new Error("Concurrent genesis build did not publish artifacts");
      return winner;
    }

    return {
      directory: finalDirectory,
      chainSpecPath: artifactPaths(finalDirectory).chainSpec,
      manifest,
      cacheHit: false,
    };
  } catch (error) {
    await rm(buildDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.main) {
  const prepared = await prepareMidnightGenesis();
  console.log(
    `${prepared.cacheHit ? "Reused" : "Generated"} ${GENESIS_PROFILE_ID}: ${prepared.chainSpecPath}`,
  );
}
