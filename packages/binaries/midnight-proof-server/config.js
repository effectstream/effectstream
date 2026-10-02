// Pure configuration helpers for the proof-server wrapper: version, port,
// cache paths, release asset URLs, Docker container names and flag parsing.
// Kept free of side effects so they can be unit-tested (index.js runs the CLI
// as soon as it is required).
const path = require("path");

const DEFAULT_VERSION = "9.0.0-rc.5";
const DEFAULT_PORT = 6300;
// Port the server listens on inside the official Docker image (`--port $PORT`).
const CONTAINER_PORT = 6300;
const BINARIES_RELEASE = "0.3.120";
const BINARIES_REPO = "effectstream/binaries";
const IMAGE_NAME = "midnightntwrk/proof-server";
const DEFAULT_CONTAINER_NAME = "midnight-proof-server";
const FINAL_BINARY_NAME = "midnight-proof-server";
const CACHE_DIR = path.join(__dirname, "proof-server");

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

/**
 * Proof-server version from `MIDNIGHT_PROOF_SERVER_VERSION`, default
 * `9.0.0-rc.5`. The value names a binaries asset, a cache directory and a
 * Docker tag, so only `[0-9A-Za-z._-]` is accepted.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function resolveVersion(env = process.env) {
  const raw = env.MIDNIGHT_PROOF_SERVER_VERSION;
  const version = typeof raw === "string" ? raw.trim() : "";
  if (!version) return DEFAULT_VERSION;
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid MIDNIGHT_PROOF_SERVER_VERSION "${version}": expected a release ` +
        `version such as ${DEFAULT_VERSION}`,
    );
  }
  return version;
}

/**
 * @param {string | number} value
 * @param {string} source where the value came from, for the error message
 * @returns {number}
 */
function parsePort(value, source) {
  const text = String(value).trim();
  const port = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proof server port from ${source}: "${value}"`);
  }
  return port;
}

/**
 * Host port: `--port` / `-p` flag, then `MIDNIGHT_PROOF_SERVER_PORT` (the
 * binary's own variable), then 6300.
 * @param {{ flagPort?: string, env?: Record<string, string | undefined> }} opts
 * @returns {number}
 */
function resolvePort({ flagPort, env = process.env } = {}) {
  if (flagPort !== undefined) return parsePort(flagPort, "--port");
  const fromEnv = env.MIDNIGHT_PROOF_SERVER_PORT;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return parsePort(fromEnv, "MIDNIGHT_PROOF_SERVER_PORT");
  }
  return DEFAULT_PORT;
}

/**
 * Docker container name for a host port. The default port keeps the
 * historical name, so existing containers are reused as before; any other
 * port gets its own container, so two versions can run side by side.
 * @param {number} port
 * @returns {string}
 */
function containerNameForPort(port) {
  return port === DEFAULT_PORT
    ? DEFAULT_CONTAINER_NAME
    : `${DEFAULT_CONTAINER_NAME}-${port}`;
}

/** @param {string} version */
function imageRef(version) {
  return `${IMAGE_NAME}:${version}`;
}

/** Cache directory of one version: `proof-server/<version>/`. */
function binaryDir(version) {
  return path.join(CACHE_DIR, version);
}

/** Cached executable of one version. */
function binaryPath(version) {
  return path.join(binaryDir(version), FINAL_BINARY_NAME);
}

/** Download target of one version (one zip per version: parallel-safe). */
function zipPath(version) {
  return path.join(__dirname, `proof-server-${version}.zip`);
}

/** Name of the executable inside the release zip. */
function assetBinaryName(platform, version) {
  return `midnight-proof-server-${platform}-${version}`;
}

/** Release asset URL for a platform and version. */
function assetUrl(platform, version) {
  return `https://github.com/${BINARIES_REPO}/releases/download/${BINARIES_RELEASE}/` +
    `${assetBinaryName(platform, version)}.zip`;
}

/**
 * Raised when the binaries release has no asset for the requested version.
 * For example 9.0.0-rc.8 is not published in 0.3.120 (only 9.0.0-rc.5 is).
 */
class MissingProofServerBinaryError extends Error {
  /**
   * @param {{ version: string, platform: string, url: string, status?: number }} info
   */
  constructor({ version, platform, url, status }) {
    super(
      `No midnight-proof-server ${version} binary for ${platform} in ` +
        `${BINARIES_REPO} release ${BINARIES_RELEASE}` +
        `${status ? ` (HTTP ${status})` : ""}: ${url}. ` +
        `Only published versions run in binary mode (default ${DEFAULT_VERSION}). ` +
        `Run this version in Docker instead (--docker, image ${imageRef(version)}), ` +
        `or point the client at an already running prover ` +
        `(e.g. MIDNIGHT_CONTRACT_PROOF_SERVER_URL for contract circuits). ` +
        `Binary mode works once the asset is published in a binaries release.`,
    );
    this.name = "MissingProofServerBinaryError";
    this.version = version;
    this.platform = platform;
    this.url = url;
    this.status = status;
  }
}

/**
 * Split CLI arguments into wrapper flags and arguments for the server.
 * `--port N`, `--port=N` and `-p N` are consumed here (the Docker port mapping
 * needs them) and re-applied to the binary in binary mode.
 * @param {string[]} argv
 */
function parseFlags(argv) {
  const flags = {
    useDocker: false,
    useBinary: false,
    cleanBinaries: false,
    onlyClean: false,
    showHelp: false,
    port: undefined,
    remaining: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--docker") flags.useDocker = true;
    else if (arg === "--binary") flags.useBinary = true;
    else if (arg === "--clean-binaries") flags.cleanBinaries = true;
    else if (arg === "--only-clean") flags.onlyClean = true;
    else if (arg === "--help" || arg === "-h") flags.showHelp = true;
    else if (arg === "--port" || arg === "-p") {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      flags.port = argv[++i];
    } else if (arg.startsWith("--port=")) flags.port = arg.slice("--port=".length);
    else flags.remaining.push(arg);
  }
  return flags;
}

// Wrapper-level variables that must not change the server inside the
// container: the image listens on `$PORT`, which is pinned to CONTAINER_PORT.
const DOCKER_ENV_EXCLUDED = new Set([
  "PORT",
  "MIDNIGHT_PROOF_SERVER_PORT",
  "MIDNIGHT_PROOF_SERVER_VERSION",
]);

/**
 * `docker run` arguments for a new container.
 * @param {{ env?: Record<string, string | undefined>, args?: string[], version: string, port: number }} opts
 * @returns {string[]}
 */
function dockerRunArgs({ env = {}, args = [], version, port }) {
  const dockerArgs = [
    "run",
    "--name",
    containerNameForPort(port),
    "-p",
    `${port}:${CONTAINER_PORT}`,
  ];
  Object.entries(env).forEach(([k, v]) => {
    if (v && !DOCKER_ENV_EXCLUDED.has(k)) dockerArgs.push("-e", `${k}=${v}`);
  });
  dockerArgs.push("-e", `PORT=${CONTAINER_PORT}`);
  dockerArgs.push(imageRef(version));
  if (args.length > 0) dockerArgs.push(...args);
  return dockerArgs;
}

module.exports = {
  DEFAULT_VERSION,
  DEFAULT_PORT,
  CONTAINER_PORT,
  BINARIES_RELEASE,
  IMAGE_NAME,
  DEFAULT_CONTAINER_NAME,
  FINAL_BINARY_NAME,
  CACHE_DIR,
  resolveVersion,
  resolvePort,
  containerNameForPort,
  imageRef,
  binaryDir,
  binaryPath,
  zipPath,
  assetBinaryName,
  assetUrl,
  MissingProofServerBinaryError,
  parseFlags,
  dockerRunArgs,
};
