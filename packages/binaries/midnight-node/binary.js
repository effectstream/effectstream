const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const CURRENT_BINARY_VERSION = "0.12.0";
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
  return `https://paima-midnight.nyc3.cdn.digitaloceanspaces.com/binaries/${FILE_NAME}`;
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
    `midnight-node-${platform}`,
  );
  const finalBinaryPath = path.join(binaryDir, FINAL_BINARY_NAME);

  if (fs.existsSync(extractedBinaryPath) &&
      extractedBinaryPath !== finalBinaryPath) {
    if (fs.existsSync(finalBinaryPath)) {
      fs.unlinkSync(finalBinaryPath);
    }
    fs.renameSync(extractedBinaryPath, finalBinaryPath);
  }

  if (!fs.existsSync(finalBinaryPath)) {
    throw new Error(`Expected binary not found: ${finalBinaryPath}`);
  }

  fs.chmodSync(finalBinaryPath, 0o755);

  fs.unlinkSync(
    path.join(
      __dirname,
      FILE_NAME,
    ),
  );
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

module.exports = {
  binary,
  getPlatform,
};
