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

const CURRENT_BINARY_VERSION = "1.0.0";
const FINAL_BINARY_NAME = "midnight-node";
const RELEASE = "0.3.120";

const CHECKSUMS = {
  "linux-amd64": {
    archive: "3826cefd5e50d3755f8d32ceb0fcf8a7c7165d35fe964bdb26b3b16657c339e4",
    executable: "e8b0fd19c106a6b9d5eb4b1497f7b9b9a9aebde8cf9b81f5146240420bbaa3c6",
  },
  "linux-arm64": {
    archive: "37ed130900b24df881e527cdb7ea21c124251d4b819d3b139a4a4252ec3dc603",
    executable: "ac61dad689798543c4ba76351e1628ba7979232e68927de93832211424c95e0f",
  },
  "macos-arm64": {
    archive: "614f1009f10adb050935061e3f0e405fc86abfc851718257d5a3a82a1a67b6ed",
    executable: "03bec991c5a55250332b532e7080e49ca761a50497ad4472316d9ff69294d369",
  },
};

function getPlatform() {
  return platformKey();
}

function getBinaryUrl(platform = getPlatform()) {
  const supportedPlatforms = require("./package.json").supportedPlatforms;
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return `https://github.com/effectstream/binaries/releases/download/${RELEASE}/midnight-node-${platform}-${CURRENT_BINARY_VERSION}.zip`;
}

function paths(env = process.env) {
  const platform = getPlatform();
  const legacyDirectory = path.join(__dirname, "midnight-node");
  const options = {
    id: "midnight-node",
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
      : path.join(__dirname, `midnight-node-${platform}-${CURRENT_BINARY_VERSION}.zip`),
  };
}

async function downloadAndSaveBinary(env = process.env) {
  assertDownloadAllowed("midnight-node", env);
  const resolved = paths(env);
  const url = getBinaryUrl(resolved.platform);
  fs.mkdirSync(path.dirname(resolved.archive), { recursive: true });
  console.error(`Downloading... ${url}`);
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(resolved.archive);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  verifyFile(resolved.archive, CHECKSUMS[resolved.platform].archive, "midnight-node archive");
  return resolved;
}

async function unzipBinary(env = process.env) {
  const resolved = paths(env);
  fs.mkdirSync(resolved.root, { recursive: true });
  await extract(resolved.archive, { dir: resolved.root });
  const extracted = path.join(
    resolved.root,
    `midnight-node-${resolved.platform}-${CURRENT_BINARY_VERSION}`,
  );
  if (!fs.existsSync(extracted)) {
    throw new Error(`Extracted binary not found at: ${extracted}`);
  }
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
    "midnight-node",
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
  assertCacheCanBeCleaned("midnight-node", env);
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
