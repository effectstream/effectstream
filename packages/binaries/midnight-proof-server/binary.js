const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const {
  DEFAULT_VERSION,
  CACHE_DIR,
  binaryDir,
  binaryPath,
  zipPath,
  assetBinaryName,
  assetUrl,
  MissingProofServerBinaryError,
} = require("./config.js");

/**
 * @returns {string} The platform and architecture of the current machine. Example: "linux-amd64"
 * Returns platform string matching the naming convention used for hosted binaries.
 * Example outputs: linux-amd64, macos-arm64
 */
function getPlatform() {
  const platform = os.platform();
  let arch = os.arch();

  if (arch === "x64") {
    arch = "amd64";
  }

  // For macOS return macos-<arch> to allow unsupported detection
  if (platform === "darwin") {
    return `macos-${arch}`;
  } else {
    return `${platform}-${arch}`;
  }
}

function getBinaryUrl(version = DEFAULT_VERSION) {
  const platform = getPlatform();
  const supportedPlatforms = require("./package.json").supportedPlatforms;

  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform for binary execution: ${platform}`);
  }

  return assetUrl(platform, version);
}

/** True when the binary of this version is already in the per-version cache. */
function checkIfBinaryExists(version = DEFAULT_VERSION) {
  return fs.existsSync(binaryPath(version));
}

/**
 * @param {string} version
 * @param {{ get: typeof axios.get }} http HTTP client (injectable for tests)
 */
async function downloadAndSaveBinary(version = DEFAULT_VERSION, http = axios) {
  const url = getBinaryUrl(version);
  console.log(`Downloading midnight proof server ${version} binary from ${url}`);

  let response;
  try {
    response = await http.get(url, { responseType: "stream" });
  } catch (error) {
    const status = error && error.response ? error.response.status : undefined;
    if (status === 404) {
      throw new MissingProofServerBinaryError({
        version,
        platform: getPlatform(),
        url,
        status,
      });
    }
    throw error;
  }
  const writer = fs.createWriteStream(zipPath(version));

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function unzipBinary(version = DEFAULT_VERSION) {
  const zip = zipPath(version);
  const destDir = binaryDir(version);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  await extract(zip, { dir: destDir });

  const platform = getPlatform();
  const extractedBinaryPath = path.join(
    destDir,
    assetBinaryName(platform, version),
  );
  const finalBinaryPath = binaryPath(version);

  // Rename the extracted file to midnight-proof-server
  if (fs.existsSync(extractedBinaryPath)) {
    if (fs.existsSync(finalBinaryPath)) {
      fs.unlinkSync(finalBinaryPath);
    }
    fs.renameSync(extractedBinaryPath, finalBinaryPath);
  } else {
    throw new Error(`Extracted binary not found at: ${extractedBinaryPath}`);
  }

  // Clean up any other extracted files (e.g., readme.md)
  const files = fs.readdirSync(destDir);
  for (const file of files) {
    const filePath = path.join(destDir, file);
    if (filePath !== finalBinaryPath && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }

  if (!fs.existsSync(finalBinaryPath)) {
    throw new Error(`Expected binary not found: ${finalBinaryPath}`);
  }

  fs.chmodSync(finalBinaryPath, 0o755);

  fs.unlinkSync(zip);
}

/**
 * Download and unpack one version into `proof-server/<version>/`.
 * @param {string} version
 * @param {{ http?: { get: typeof axios.get } }} [options]
 */
async function binary(version = DEFAULT_VERSION, options = {}) {
  await downloadAndSaveBinary(version, options.http ?? axios);
  await unzipBinary(version);
}

/** Delete every cached version and any leftover download. */
async function cleanBinaries() {
  const zipFiles = fs.readdirSync(__dirname)
    .filter((name) => /^proof-server(-.+)?\.zip$/.test(name))
    .map((name) => path.join(__dirname, name));

  let deletedFiles = [];

  if (fs.existsSync(CACHE_DIR)) {
    try {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      deletedFiles.push(CACHE_DIR);
    } catch (error) {
      console.error(`Error removing directory ${CACHE_DIR}:`, error.message);
    }
  }

  for (const zip of zipFiles) {
    try {
      fs.unlinkSync(zip);
      deletedFiles.push(zip);
    } catch (error) {
      console.error(`Error removing file ${zip}:`, error.message);
    }
  }

  return deletedFiles;
}

module.exports = {
  binary,
  getPlatform,
  getBinaryUrl,
  checkIfBinaryExists,
  cleanBinaries,
};
