const os = require("os");
const fs = require("fs");
const axios = require("axios");
const extract = require("extract-zip");
const path = require("path");

const CURRENT_BINARY_VERSION = "v4.4.0-rc.1";
const FINAL_BINARY_NAME = "indexer-standalone";

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

const ZIP_FILE_PATH = path.join(__dirname, "indexer-standalone.zip");

/*
@returns {Promise<void>} Downloads and saves the binary for the current platform.
*/
async function downloadAndSaveBinary() {
  const url = getBinaryUrl();
  try {
    console.error(`Downloading... ${url}`);
    const response = await axios.get(url, { responseType: "stream" });
    const writer = fs.createWriteStream(ZIP_FILE_PATH);

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
  await extract(ZIP_FILE_PATH, { dir });
  const dataDir = path.join(dir, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const platform = getPlatform();
  const possibleBinaryNames = [
    `indexer-standalone-${platform}-${CURRENT_BINARY_VERSION}`,
    `indexer-standalone`,
    `indexer-standalone-${platform}`
  ];

  let extractedBinaryPath = null;
  for (const name of possibleBinaryNames) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      extractedBinaryPath = p;
      break;
    }
  }

  const finalBinaryPath = path.join(dir, FINAL_BINARY_NAME);

  // Rename the extracted file to indexer-standalone
  if (extractedBinaryPath) {
    if (extractedBinaryPath !== finalBinaryPath) {
      if (fs.existsSync(finalBinaryPath)) {
        fs.unlinkSync(finalBinaryPath);
      }
      fs.renameSync(extractedBinaryPath, finalBinaryPath);
    }
  } else {
    throw new Error(`Extracted binary not found in: ${dir}. Expected one of: ${possibleBinaryNames.join(", ")}`);
  }

  // Clean up any other extracted files (e.g., readme.md)
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    // Explicitly protect config.yaml and other potential config files
    const isConfigFile =
      file === "config.yaml" ||
      file === "config.yml" ||
      file.endsWith(".yaml") ||
      file.endsWith(".yml") ||
      file.endsWith(".toml") ||
      file.endsWith(".json");

    if (
      filePath !== finalBinaryPath &&
      file !== "data" &&
      !isConfigFile &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      console.log(`Cleaning up extracted file: ${file}`);
      fs.unlinkSync(filePath);
    }
  }

  if (!fs.existsSync(finalBinaryPath)) {
    throw new Error(`Expected binary not found: ${finalBinaryPath}`);
  }

  fs.chmodSync(finalBinaryPath, 0o755);
  fs.unlinkSync(ZIP_FILE_PATH);
}

async function binary() {
  await downloadAndSaveBinary();
  await unzipBinary();
}

async function cleanBinaries() {
  const binaryDir = path.join(__dirname, "indexer-standalone");
  const binaryPath = path.join(binaryDir, FINAL_BINARY_NAME);
  const zipPath = path.join(__dirname, "indexer-standalone.zip");

  let deletedFiles = [];

  // Delete the binary executable if it exists
  if (fs.existsSync(binaryPath)) {
    try {
      fs.unlinkSync(binaryPath);
      deletedFiles.push(binaryPath);
    } catch (error) {
      console.error(`Error removing binary ${binaryPath}:`, error.message);
    }
  }

  // Delete the zip file if it exists
  if (fs.existsSync(zipPath)) {
    try {
      fs.unlinkSync(zipPath);
      deletedFiles.push(zipPath);
    } catch (error) {
      console.error(`Error removing file ${zipPath}:`, error.message);
    }
  }

  // Delete any other binary-related files from the directory, preserving config files
  if (fs.existsSync(binaryDir)) {
    const files = fs.readdirSync(binaryDir);
    for (const file of files) {
      const filePath = path.join(binaryDir, file);
      const stat = fs.statSync(filePath);

      // Preserve config files and readme
      const isConfigFile =
        file === "config.yaml" ||
        file === "config.yml" ||
        file.endsWith(".yaml") ||
        file.endsWith(".yml") ||
        file.endsWith(".toml") ||
        file.endsWith(".json") ||
        file.toLowerCase().startsWith("readme") ||
        file.toLowerCase().startsWith("license") ||
        file.toLowerCase().startsWith("changelog");

      if (!isConfigFile && stat.isFile() && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deletedFiles.push(filePath);
        } catch (error) {
          console.error(`Error removing file ${filePath}:`, error.message);
        }
      }
    }
  }

  return deletedFiles;
}

module.exports = {
  binary,
  getPlatform,
  cleanBinaries,
};
