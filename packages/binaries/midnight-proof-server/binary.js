const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const CURRENT_BINARY_VERSION = "9.0.0-rc.5";
const FINAL_BINARY_NAME = "midnight-proof-server";

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

function getBinaryUrl() {
  const platform = getPlatform();
  const supportedPlatforms = require("./package.json").supportedPlatforms;

  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform for binary execution: ${platform}`);
  }

  return `https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-proof-server-${platform}-${CURRENT_BINARY_VERSION}.zip`;
}

async function downloadAndSaveBinary() {
  const url = getBinaryUrl();
  console.log(`Downloading midnight proof server binary from ${url}`);

  const response = await axios.get(url, { responseType: "stream" });
  const zipPath = path.join(__dirname, "proof-server.zip");
  const writer = fs.createWriteStream(zipPath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function unzipBinary() {
  const zipPath = path.join(__dirname, "proof-server.zip");
  const destDir = path.join(__dirname, "proof-server");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  await extract(zipPath, { dir: destDir });
  
  const platform = getPlatform();
  const extractedBinaryPath = path.join(
    destDir,
    `midnight-proof-server-${platform}-${CURRENT_BINARY_VERSION}`,
  );
  const finalBinaryPath = path.join(destDir, FINAL_BINARY_NAME);

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

  fs.unlinkSync(zipPath);
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

async function cleanBinaries() {
  const binaryDir = path.join(__dirname, "proof-server");
  const zipPath = path.join(__dirname, "proof-server.zip");

  let deletedFiles = [];

  if (fs.existsSync(binaryDir)) {
    try {
      fs.rmSync(binaryDir, { recursive: true, force: true });
      deletedFiles.push(binaryDir);
    } catch (error) {
      console.error(`Error removing directory ${binaryDir}:`, error.message);
    }
  }

  if (fs.existsSync(zipPath)) {
    try {
      fs.unlinkSync(zipPath);
      deletedFiles.push(zipPath);
    } catch (error) {
      console.error(`Error removing file ${zipPath}:`, error.message);
    }
  }

  return deletedFiles;
}

module.exports = { binary, getPlatform, cleanBinaries };
