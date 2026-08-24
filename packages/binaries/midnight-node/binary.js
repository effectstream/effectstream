const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const CURRENT_BINARY_VERSION = "2.0.0-rc.4";
const FINAL_BINARY_NAME = "midnight-node";

/*
@returns {string} The platform and architecture of the current machine.
*/
function getPlatform() {
  let platform = os.platform();
  let arch = os.arch();
  if (platform === "darwin") platform = "macos";
  if (arch === "x64") arch = "amd64";
  return `${platform}-${arch}`;
}

const FILE_NAME =
  `midnight-node-${getPlatform()}-${CURRENT_BINARY_VERSION}.zip`;

/*
@returns {string} The URL to download the binary for the current platform.
*/
function getBinaryUrl() {
  const platform = getPlatform();
  const supportedPlatforms = require("./package.json").supportedPlatforms;
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return `https://github.com/effectstream/binaries/releases/download/0.3.120/${FILE_NAME}`;
}

/*
@returns {Promise<void>} Downloads and saves the binary for the current platform.
*/
async function downloadAndSaveBinary() {
  const url = getBinaryUrl();
  try {
    console.error(`Downloading... ${url}`);

    const response = await axios.get(url, { responseType: "stream" });
    const writer = fs.createWriteStream(
      path.join(
        __dirname,
        FILE_NAME,
      ),
    );

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Error downloading binary:", error);
    throw error;
  }
}

/*
@returns {Promise<void>} Unzips the binary for the current platform.
*/
async function unzipBinary() {
  const binaryDir = path.join(__dirname, "midnight-node");
  await extract(path.join(__dirname, FILE_NAME), { dir: binaryDir });
  const platform = getPlatform();
  const extractedBinaryPath = path.join(
    binaryDir,
    `midnight-node-${platform}-${CURRENT_BINARY_VERSION}`,
  );
  const finalBinaryPath = path.join(binaryDir, FINAL_BINARY_NAME);

  // Rename the extracted file to midnight-node
  if (fs.existsSync(extractedBinaryPath)) {
    if (fs.existsSync(finalBinaryPath)) {
      fs.unlinkSync(finalBinaryPath);
    }
    fs.renameSync(extractedBinaryPath, finalBinaryPath);
  } else {
    throw new Error(`Extracted binary not found at: ${extractedBinaryPath}`);
  }

  // Clean up any other extracted files (e.g., readme.md)
  const files = fs.readdirSync(binaryDir);
  for (const file of files) {
    const filePath = path.join(binaryDir, file);
    if (filePath !== finalBinaryPath && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }

  if (!fs.existsSync(finalBinaryPath)) {
    throw new Error(`Expected binary not found: ${finalBinaryPath}`);
  }

  fs.chmodSync(finalBinaryPath, 0o755);

  fs.unlinkSync(path.join(__dirname, FILE_NAME));
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

async function cleanBinaries() {
  const binaryDir = path.join(__dirname, "midnight-node");
  const zipPath = path.join(__dirname, FILE_NAME);

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

module.exports = {
  binary,
  getPlatform,
  cleanBinaries,
};
