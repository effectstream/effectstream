const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function platformKey(platform = os.platform(), architecture = os.arch()) {
  const normalizedPlatform = platform === "darwin" ? "macos" : platform;
  const normalizedArch = architecture === "x64" ? "amd64" : architecture;
  return `${normalizedPlatform}-${normalizedArch}`;
}

function envFlag(name, env = process.env) {
  return ["1", "true", "yes", "on"].includes(
    String(env[name] ?? "").toLowerCase(),
  );
}

function isOffline(env = process.env) {
  return envFlag("EFFECTSTREAM_OFFLINE", env);
}

function usesExternalCache(env = process.env) {
  return Boolean(env.EFFECTSTREAM_BINARY_CACHE_DIR);
}

function artifactDirectory({ id, version, legacyDirectory, env = process.env, platform }) {
  if (!env.EFFECTSTREAM_BINARY_CACHE_DIR) return legacyDirectory;
  return path.resolve(
    env.EFFECTSTREAM_BINARY_CACHE_DIR,
    id,
    version,
    platform ?? platformKey(),
  );
}

function binaryPath(options) {
  if (!options.env?.EFFECTSTREAM_BINARY_CACHE_DIR && options.legacyBinaryPath) {
    return options.legacyBinaryPath;
  }
  return path.join(artifactDirectory(options), "bin", options.executable);
}

function runtimeDirectory(id, env = process.env) {
  const root = env.EFFECTSTREAM_RUNTIME_DIR
    ? path.resolve(env.EFFECTSTREAM_RUNTIME_DIR)
    : path.resolve(process.cwd(), ".effectstream", "runtime");
  return path.join(root, id);
}

function assertDownloadAllowed(id, env = process.env) {
  if (isOffline(env)) {
    throw new Error(
      `[${id}] binary is absent or invalid and EFFECTSTREAM_OFFLINE=1; ` +
        `prewarm EFFECTSTREAM_BINARY_CACHE_DIR when building the runtime image`,
    );
  }
}

function assertCacheCanBeCleaned(id, env = process.env) {
  if (usesExternalCache(env)) {
    throw new Error(
      `[${id}] refusing to clean shared EFFECTSTREAM_BINARY_CACHE_DIR; ` +
        `rebuild or prewarm the cache instead`,
    );
  }
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyFile(file, expectedSha256, id) {
  if (!fs.existsSync(file)) {
    throw new Error(`[${id}] expected file is missing: ${file}`);
  }
  const actual = sha256File(file);
  if (actual !== expectedSha256) {
    throw new Error(
      `[${id}] checksum mismatch for ${file}\n  got      ${actual}\n  expected ${expectedSha256}`,
    );
  }
  return file;
}

function ensureRuntimeDirectory(id, env = process.env) {
  const directory = runtimeDirectory(id, env);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

module.exports = {
  artifactDirectory,
  assertCacheCanBeCleaned,
  assertDownloadAllowed,
  binaryPath,
  ensureRuntimeDirectory,
  envFlag,
  isOffline,
  platformKey,
  runtimeDirectory,
  sha256File,
  usesExternalCache,
  verifyFile,
};
