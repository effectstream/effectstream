const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const CURRENT_BINARY_VERSION = "v2.1.4";

/*
@returns {string} The platform and architecture of the current machine. Example: "linux-amd64"
*/
function getPlatform() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin") {
    // For macOS, return the full platform-arch combination
    if (arch === "x64") {
      return "macos-amd64"; // Will not be in supportedPlatforms, so will fall back to Docker
    } else {
      return `macos-${arch}`;
    }
  } else {
    // For Linux and other platforms, only arch is needed
    if (arch === "x64") {
      return `${platform}-amd64`;
    }
    return `${platform}-${arch}`;
  }
}

/*
@returns {string} The URL to download the binary for the current platform.
*/
function getBinaryUrl() {
  const platform = getPlatform();
  const supportedPlatforms = require("./package.json").supportedPlatforms;
  // Check if platform is supported
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return `https://github.com/effectstream/binaries/releases/download/0.3.120/indexer-standalone-${platform}-${CURRENT_BINARY_VERSION}.zip`;
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
      path.join(__dirname, "indexer-standalone.zip"),
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
  const dir = path.join(__dirname, "indexer-standalone");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await extract(path.join(__dirname, "indexer-standalone.zip"), { dir });
  fs.unlinkSync(path.join(__dirname, "indexer-standalone.zip"));

  const platform = getPlatform();
  const parts = platform.split("-");
  if (parts[0] === "linux") {
    fs.chmodSync(
      path.join(
        __dirname,
        "indexer-standalone",
        `indexer-standalone-${platform}`,
      ),
      0o755,
    );
  }
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

module.exports = {
  binary,
  getPlatform,
};
