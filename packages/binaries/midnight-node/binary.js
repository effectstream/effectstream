const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");

const axios = require("axios");
const extract = require("extract-zip");

const COMPONENT = "midnight-node";
const CURRENT_BINARY_VERSION = "2.0.0-rc.4";
const FINAL_BINARY_NAME = "midnight-node";
const CACHE_DIR_NAME = "midnight-node";
const CACHE_METADATA_NAME = ".effectstream-binary.json";

const ASSETS = Object.freeze({
  "macos-arm64": Object.freeze({
    platform: "macos-arm64",
    version: CURRENT_BINARY_VERSION,
    archiveName: "midnight-node-macos-arm64-2.0.0-rc.4.zip",
    executableName: "midnight-node-macos-arm64-2.0.0-rc.4",
    sha256: "4ee77c1043dec716f7a1b133f0ebb8f23bbc3a704f348ae5708a6b58b330ed8c",
    url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-node-macos-arm64-2.0.0-rc.4.zip",
    requiredDirectories: ["res"],
  }),
  "linux-amd64": Object.freeze({
    platform: "linux-amd64",
    version: CURRENT_BINARY_VERSION,
    archiveName: "midnight-node-linux-amd64-2.0.0-rc.4.zip",
    executableName: "midnight-node-linux-amd64-2.0.0-rc.4",
    sha256: "8f53e9dfb2c70ec2fb98fd6958466ef107685774ca4d93660bc63e7686948879",
    url: "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-node-linux-amd64-2.0.0-rc.4.zip",
    requiredDirectories: ["res"],
  }),
});

function getPlatform(platform = os.platform(), arch = os.arch()) {
  if (platform === "darwin") platform = "macos";
  if (arch === "x64") arch = "amd64";
  return `${platform}-${arch}`;
}

function getAsset(platform = getPlatform()) {
  const supportedPlatforms = require("./package.json").supportedPlatforms;
  if (!supportedPlatforms.includes(platform) || !ASSETS[platform]) {
    throw new Error(
      `Unsupported platform for ${COMPONENT}: ${platform}. ` +
        `Published targets: ${Object.keys(ASSETS).join(", ")}`,
    );
  }
  return ASSETS[platform];
}

function getBinaryUrl(platform = getPlatform()) {
  return getAsset(platform).url;
}

function getPaths(baseDir = __dirname, asset = getAsset()) {
  const cacheDir = path.join(baseDir, CACHE_DIR_NAME);
  return {
    archivePath: path.join(baseDir, asset.archiveName),
    binaryPath: path.join(cacheDir, FINAL_BINARY_NAME),
    cacheDir,
    metadataPath: path.join(cacheDir, CACHE_METADATA_NAME),
  };
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function removePath(target) {
  fs.rmSync(target, { force: true, recursive: true });
}

async function downloadAndSaveBinary({
  asset = getAsset(),
  baseDir = __dirname,
  httpClient = axios,
} = {}) {
  const { archivePath } = getPaths(baseDir, asset);
  const partialPath = `${archivePath}.part-${process.pid}-${Date.now()}`;
  fs.mkdirSync(baseDir, { recursive: true });
  removePath(archivePath);

  try {
    console.error(`[${COMPONENT}] downloading ${asset.url}`);
    const response = await httpClient.get(asset.url, {
      responseType: "stream",
      timeout: 120000,
    });
    await pipeline(response.data, fs.createWriteStream(partialPath));
    fs.renameSync(partialPath, archivePath);
    return archivePath;
  } catch (error) {
    removePath(partialPath);
    removePath(archivePath);
    const status = error.response?.status;
    throw new Error(
      `[${COMPONENT}] failed to download ${asset.url}` +
        (status ? ` (HTTP ${status})` : "") +
        `: ${error.message}`,
      { cause: error },
    );
  }
}

function verifyArchiveIntegrity(archivePath, asset = getAsset()) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(
      `[${COMPONENT}] downloaded archive is missing: ${archivePath}`,
    );
  }
  const actual = sha256File(archivePath);
  if (actual !== asset.sha256) {
    removePath(archivePath);
    throw new Error(
      `[${COMPONENT}] SHA-256 mismatch for ${asset.archiveName}: ` +
        `expected ${asset.sha256}, got ${actual}. Refusing to extract or run it.`,
    );
  }
  return actual;
}

function expectedMetadata(asset, executableSha256) {
  return {
    component: COMPONENT,
    platform: asset.platform,
    version: asset.version,
    archiveName: asset.archiveName,
    archiveSha256: asset.sha256,
    executableName: asset.executableName,
    executableSha256,
  };
}

function isBinaryCacheValid({
  asset = getAsset(),
  baseDir = __dirname,
} = {}) {
  const { binaryPath, cacheDir, metadataPath } = getPaths(baseDir, asset);
  try {
    const stat = fs.statSync(binaryPath);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) return false;
    for (const directory of asset.requiredDirectories || []) {
      if (!fs.statSync(path.join(cacheDir, directory)).isDirectory()) {
        return false;
      }
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const expected = expectedMetadata(asset, metadata.executableSha256);
    for (const [key, value] of Object.entries(expected)) {
      if (metadata[key] !== value) return false;
    }
    return sha256File(binaryPath) === metadata.executableSha256;
  } catch {
    return false;
  }
}

async function unzipBinary({
  asset = getAsset(),
  baseDir = __dirname,
  archivePath = getPaths(baseDir, asset).archivePath,
} = {}) {
  const { binaryPath, cacheDir, metadataPath } = getPaths(baseDir, asset);
  const stagingDir = fs.mkdtempSync(
    path.join(baseDir, `.${CACHE_DIR_NAME}-extract-`),
  );
  const stagedBinary = path.join(stagingDir, asset.executableName);

  try {
    await extract(archivePath, { dir: stagingDir });
    if (!fs.existsSync(stagedBinary) || !fs.statSync(stagedBinary).isFile()) {
      throw new Error(
        `[${COMPONENT}] expected extracted executable missing: ` +
          `${asset.executableName} in ${asset.archiveName}`,
      );
    }
    for (const directory of asset.requiredDirectories || []) {
      const stagedDirectory = path.join(stagingDir, directory);
      if (
        !fs.existsSync(stagedDirectory) ||
        !fs.statSync(stagedDirectory).isDirectory()
      ) {
        throw new Error(
          `[${COMPONENT}] required archive directory missing: ${directory}/ ` +
            `in ${asset.archiveName}`,
        );
      }
    }

    fs.chmodSync(stagedBinary, 0o755);
    const executableSha256 = sha256File(stagedBinary);
    fs.mkdirSync(cacheDir, { recursive: true });

    const stagedFinal = `${binaryPath}.install-${process.pid}`;
    removePath(stagedFinal);
    fs.copyFileSync(stagedBinary, stagedFinal);
    fs.chmodSync(stagedFinal, 0o755);
    removePath(binaryPath);
    fs.renameSync(stagedFinal, binaryPath);

    for (const directory of asset.requiredDirectories || []) {
      const finalDirectory = path.join(cacheDir, directory);
      removePath(finalDirectory);
      fs.renameSync(path.join(stagingDir, directory), finalDirectory);
    }

    const metadataTemp = `${metadataPath}.install-${process.pid}`;
    fs.writeFileSync(
      metadataTemp,
      `${JSON.stringify(expectedMetadata(asset, executableSha256), null, 2)}\n`,
    );
    removePath(metadataPath);
    fs.renameSync(metadataTemp, metadataPath);

    if (!isBinaryCacheValid({ asset, baseDir })) {
      throw new Error(
        `[${COMPONENT}] installed cache failed executable or metadata validation`,
      );
    }
    return binaryPath;
  } finally {
    removePath(stagingDir);
    removePath(archivePath);
  }
}

async function binary({
  platform = getPlatform(),
  asset = getAsset(platform),
  baseDir = __dirname,
  httpClient = axios,
} = {}) {
  const { binaryPath } = getPaths(baseDir, asset);
  if (isBinaryCacheValid({ asset, baseDir })) {
    return { binaryPath, downloaded: false };
  }

  const archivePath = await downloadAndSaveBinary({
    asset,
    baseDir,
    httpClient,
  });
  verifyArchiveIntegrity(archivePath, asset);
  await unzipBinary({ asset, baseDir, archivePath });
  return { binaryPath, downloaded: true };
}

async function cleanBinaries({ baseDir = __dirname } = {}) {
  const deletedFiles = [];
  const cacheDir = path.join(baseDir, CACHE_DIR_NAME);
  if (fs.existsSync(cacheDir)) {
    removePath(cacheDir);
    deletedFiles.push(cacheDir);
  }

  if (fs.existsSync(baseDir)) {
    for (const file of fs.readdirSync(baseDir)) {
      if (
        (file.startsWith("midnight-node-") && file.includes(".zip")) ||
        file.startsWith(`.${CACHE_DIR_NAME}-extract-`)
      ) {
        const target = path.join(baseDir, file);
        removePath(target);
        deletedFiles.push(target);
      }
    }
  }
  return deletedFiles;
}

module.exports = {
  ASSETS,
  CURRENT_BINARY_VERSION,
  FINAL_BINARY_NAME,
  binary,
  cleanBinaries,
  downloadAndSaveBinary,
  getAsset,
  getBinaryUrl,
  getPaths,
  getPlatform,
  isBinaryCacheValid,
  sha256File,
  unzipBinary,
  verifyArchiveIntegrity,
};
