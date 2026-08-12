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

const CURRENT_BINARY_VERSION = "v4.3.3";
const FINAL_BINARY_NAME = "indexer-standalone";
const RELEASE = "0.3.120";

const CHECKSUMS = {
  "linux-amd64": {
    archive: "467a496dde5794180eb3b25ce7544428cf214b05fc51f95d34cc703826f0c1e4",
    executable: "79744f23e9f58b6562131c07d938c17cfff0856c8f476745b820a57cf8892fb5",
  },
  "linux-arm64": {
    archive: "244fc6b1dde1dc4400ac2ea27f1ef4ce3794776cb7d153b85b93cb1ff8764212",
    executable: "f36cf632d9c2a62f9cfa13fe71d50e309fea352cf009d24490b1de0e606955df",
  },
  "macos-arm64": {
    archive: "bb44742626bf741ca4eb33d76e495b9460a693e34c3129886243ec2ed081491c",
    executable: "012fd1019c48f2e90624ea8ca861f19680f7cfbdea1bb1ebc1ab9d6071c44f77",
  },
};

function getPlatform() {
  return platformKey();
}

function getBinaryUrl(platform = getPlatform()) {
  const supported = require("./package.json").supportedPlatforms;
  if (!supported.includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
  return `https://github.com/effectstream/binaries/releases/download/${RELEASE}/indexer-standalone-${platform}-${CURRENT_BINARY_VERSION}.zip`;
}

function paths(env = process.env) {
  const platform = getPlatform();
  const legacyDirectory = path.join(__dirname, "indexer-standalone");
  const options = {
    id: "midnight-indexer",
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
      : path.join(__dirname, "indexer-standalone.zip"),
  };
}

async function downloadAndSaveBinary(env = process.env) {
  assertDownloadAllowed("midnight-indexer", env);
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
  verifyFile(resolved.archive, CHECKSUMS[resolved.platform].archive, "midnight-indexer archive");
  return resolved;
}

async function unzipBinary(env = process.env) {
  const resolved = paths(env);
  fs.mkdirSync(resolved.root, { recursive: true });
  await extract(resolved.archive, { dir: resolved.root });
  const candidates = [
    `indexer-standalone-${resolved.platform}-${CURRENT_BINARY_VERSION}`,
    "indexer-standalone",
    `indexer-standalone-${resolved.platform}`,
  ];
  const extracted = candidates
    .map((name) => path.join(resolved.root, name))
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!extracted) throw new Error(`Extracted binary not found in: ${resolved.root}`);
  fs.mkdirSync(path.dirname(resolved.binary), { recursive: true });
  if (extracted !== resolved.binary) {
    if (fs.existsSync(resolved.binary)) fs.unlinkSync(resolved.binary);
    fs.renameSync(extracted, resolved.binary);
  }
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
    "midnight-indexer",
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
  assertCacheCanBeCleaned("midnight-indexer", env);
  const resolved = paths(env);
  const deletedFiles = [];
  for (const target of [resolved.binary, resolved.archive]) {
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { force: true });
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
