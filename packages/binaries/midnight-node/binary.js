const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

function getPlatform() {
  let platform = os.platform();
  let arch = os.arch();
  if (platform === "darwin") platform = "macos";
  if (arch === "x64") arch = "amd64";
  return `${platform}-${arch}`;
}

function getBinaryUrl() {
  const platform = getPlatform();
  const supportedPlatforms = require("./package.json").supportedPlatforms;
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return `https://paima-midnight.nyc3.cdn.digitaloceanspaces.com/binaries/midnight-node-${platform}.zip`;
}

async function downloadAndSaveBinary() {
  const url = getBinaryUrl();
  try {
    console.error(`Downloading... ${url}`);

    // workaround for missing res
    if (
      url ===
        "https://paima-midnight.nyc3.cdn.digitaloceanspaces.com/binaries/midnight-node-linux-amd64.zip"
    ) {
      console.error("Apply workaround");
      const d =
        "https://paima-midnight.nyc3.cdn.digitaloceanspaces.com/binaries/midnight-node-linux-arm64.zip";
      const response = await axios.get(d, { responseType: "stream" });
      const writer = fs.createWriteStream(
        path.join(__dirname, "midnight-node_.zip"),
      );

      response.data.pipe(writer);

      const p = new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      await p;
      await extract(path.join(__dirname, "midnight-node_.zip"), {
        dir: path.join(__dirname, "midnight-node"),
      });
      fs.unlinkSync(path.join(__dirname, "midnight-node.zip_"));
    }

    const response = await axios.get(url, { responseType: "stream" });
    const writer = fs.createWriteStream(
      path.join(__dirname, "midnight-node.zip"),
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

async function unzipBinary() {
  await extract(path.join(__dirname, "midnight-node.zip"), {
    dir: path.join(__dirname, "midnight-node"),
  });
  const platform = getPlatform();
  const parts = platform.split("-");
  if (parts[0] === "linux") {
    fs.chmodSync(
      path.join(__dirname, "midnight-node", `midnight-node-${platform}`),
      0o755,
    );
  }
  fs.unlinkSync(path.join(__dirname, "midnight-node.zip"));
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

module.exports = {
  binary,
  getPlatform,
};
