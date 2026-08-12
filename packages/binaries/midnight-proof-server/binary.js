const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");
const {
  artifactDirectory,
  assertCacheCanBeCleaned,
  assertDownloadAllowed,
  binaryPath,
  platformKey,
  usesExternalCache,
  verifyFile,
} = require("@effectstream/binary-runtime");

const CURRENT_BINARY_VERSION = "ledger-8.1.0";
const FINAL_BINARY_NAME = "midnight-proof-server";
const RELEASE = "0.3.120";

const CHECKSUMS = {
  "linux-amd64": {
    archive: "21d9893c947948fd183711d15db3e0b16563ef44fb2849f417fe36724f9df279",
    executable: "fccaa8f517ba425e8a2a0ff2b291713a82b1fcc87a77c79cd4bc016dd976341e",
  },
  "linux-arm64": {
    archive: "13aa2fb681012b21e59f0c9db0048ecff146d08b38c6699c62c99106179d8221",
    executable: "df4d56bf100721a7ed450523dd8df926512286285635997ea2ada317e1e71801",
  },
  "macos-arm64": {
    archive: "e9894e62c5753097a0a086c6a9c11ec0af3a57b0be52c141c33f70f63a528ad2",
    executable: "9aadfb789481b1d9729669980c3b50f38335d4d8e61cd336ae25ff003e7bd959",
  },
};

function getPlatform() {
  return platformKey();
}

function getBinaryUrl(platform = getPlatform()) {
  const supported = require("./package.json").supportedPlatforms;
  if (!supported.includes(platform)) {
    throw new Error(`Unsupported platform for binary execution: ${platform}`);
  }
  return `https://github.com/effectstream/binaries/releases/download/${RELEASE}/midnight-proof-server-${platform}-${CURRENT_BINARY_VERSION}.zip`;
}

function paths(env = process.env) {
  const platform = getPlatform();
  const legacyDirectory = path.join(__dirname, "proof-server");
  const options = {
    id: "midnight-proof-server",
    version: CURRENT_BINARY_VERSION,
    platform,
    executable: FINAL_BINARY_NAME,
    legacyDirectory,
    legacyBinaryPath: path.join(legacyDirectory, FINAL_BINARY_NAME),
    env,
  };
  const root = artifactDirectory(options);
  return {
    platform,
    root,
    binary: binaryPath(options),
    archive: usesExternalCache(env)
      ? path.join(root, ".download.zip")
      : path.join(__dirname, "proof-server.zip"),
  };
}

async function downloadAndSaveBinary(env = process.env) {
  assertDownloadAllowed("midnight-proof-server", env);
  const resolved = paths(env);
  const url = getBinaryUrl(resolved.platform);
  fs.mkdirSync(path.dirname(resolved.archive), { recursive: true });
  console.log(`Downloading midnight proof server binary from ${url}`);
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(resolved.archive);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  verifyFile(resolved.archive, CHECKSUMS[resolved.platform].archive, "midnight-proof-server archive");
  return resolved;
}

async function unzipBinary(env = process.env) {
  const resolved = paths(env);
  fs.mkdirSync(resolved.root, { recursive: true });
  await extract(resolved.archive, { dir: resolved.root });
  const extracted = path.join(
    resolved.root,
    `midnight-proof-server-${resolved.platform}-${CURRENT_BINARY_VERSION}`,
  );
  if (!fs.existsSync(extracted)) throw new Error(`Extracted binary not found at: ${extracted}`);
  fs.mkdirSync(path.dirname(resolved.binary), { recursive: true });
  if (fs.existsSync(resolved.binary)) fs.unlinkSync(resolved.binary);
  fs.renameSync(extracted, resolved.binary);
  fs.chmodSync(resolved.binary, 0o755);
  verifyBinary(env);
  fs.unlinkSync(resolved.archive);
  return resolved.binary;
}

function verifyBinary(env = process.env) {
  const resolved = paths(env);
  return verifyFile(
    resolved.binary,
    CHECKSUMS[resolved.platform].executable,
    "midnight-proof-server",
  );
}

async function binary(env = process.env) {
  await downloadAndSaveBinary(env);
  return unzipBinary(env);
}

async function ensureBinary(env = process.env) {
  const resolved = paths(env);
  if (!fs.existsSync(resolved.binary)) await binary(env);
  return verifyBinary(env);
}

async function cleanBinaries(env = process.env) {
  assertCacheCanBeCleaned("midnight-proof-server", env);
  const resolved = paths(env);
  const deletedFiles = [];
  for (const target of [resolved.root, resolved.archive]) {
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    deletedFiles.push(target);
  }
  return deletedFiles;
}

module.exports = {
  CHECKSUMS,
  CURRENT_BINARY_VERSION,
  binary,
  cleanBinaries,
  ensureBinary,
  getBinaryPath: (env = process.env) => paths(env).binary,
  getBinaryRoot: (env = process.env) => paths(env).root,
  getBinaryUrl,
  getPlatform,
  verifyBinary,
};
