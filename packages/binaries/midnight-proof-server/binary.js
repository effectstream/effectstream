const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

/**
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

  // TODO: Replace placeholder link with real URL once available
  return `https://paima-midnight.nyc3.cdn.digitaloceanspaces.com/binaries/midnight-proof-server-${platform}.zip`;
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

  await extract(zipPath, { dir: destDir });
  fs.unlinkSync(zipPath);
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

module.exports = { binary, getPlatform };
