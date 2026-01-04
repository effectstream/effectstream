const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const tar = require("tar");
const extract = require("extract-zip");

const downloadLinks = {
  "apple-arm64":
    "https://github.com/availproject/avail-light/releases/download/avail-light-client-v1.13.2/avail-light-apple-arm64.tar.gz",
  "apple-x86_64":
    "https://github.com/availproject/avail-light/releases/download/avail-light-client-v1.13.2/avail-light-apple-x86_64.tar.gz",
  "linux-amd64":
    "https://github.com/availproject/avail-light/releases/download/avail-light-client-v1.13.2/avail-light-linux-amd64.tar.gz",
  "windows-x86_64":
    "https://github.com/availproject/avail-light/releases/download/avail-light-client-v1.13.2/avail-light-x86_64-pc-windows-msvc.exe.zip",
};

const getBinaryKey = () => {
  const isLinux = os.platform() === "linux";
  const isWindows = os.platform() === "win32";
  const isApple = os.platform() === "darwin";
  const isArm = os.arch() === "arm64";
  const isX86 = os.arch() === "x64";

  if (isLinux && isArm) {
    throw new Error(
      "Unsupported platform: Linux ARM64 is not supported for native binary.",
    );
  }

  if (isLinux && isX86) return "linux-amd64";

  if (isWindows && isX86) return "windows-x86_64";

  if (isApple && isArm) return "apple-arm64";

  if (isApple && isX86) return "apple-x86_64";

  throw new Error("Unsupported platform");
};

const getBinaryLink = () => {
  const key = getBinaryKey();
  const binaryLink = downloadLinks[key];
  if (!binaryLink) throw new Error("Unsupported platform " + key);
  return binaryLink;
};

const getBinaryPath = () => {
  const key = getBinaryKey();
  const isWindows = key.startsWith("windows");
  const exeName = isWindows ? "avail-light-client.exe" : "avail-light-client";
  return path.join(__dirname, "bin", exeName);
};

const ensureExecutable = (binaryPath) => {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at path: ${binaryPath}`);
  }
  try {
    fs.chmodSync(binaryPath, 0o755);
  } catch (error) {
    console.warn(`Failed to chmod ${binaryPath}: ${error.message}`);
  }
};

const downloadBinary = async () => {
  const binaryLink = getBinaryLink();
  const key = getBinaryKey();
  const binDir = path.join(__dirname, "bin");
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const tempPath = path.join(__dirname, path.basename(binaryLink));

  console.log(`Downloading binary from ${binaryLink}...`);
  const response = await fetch(binaryLink);
  if (!response.ok) {
    throw new Error(`Failed to download binary: ${response.statusText}`);
  }
  const fileStream = fs.createWriteStream(tempPath);
  await new Promise(async (resolve, reject) => {
    try {
      for await (const chunk of response.body) {
        fileStream.write(chunk);
      }
      fileStream.end();
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });

  console.log("Extracting binary...");
  if (binaryLink.endsWith(".zip")) {
    await extract(tempPath, { dir: path.join(__dirname, "bin") });
    const files = fs.readdirSync(path.join(__dirname, "bin"));
    const exeFile = files.find((f) => f.endsWith(".exe"));
    if (exeFile && exeFile !== "avail-light-client.exe") {
      fs.renameSync(
        path.join(__dirname, "bin", exeFile),
        path.join(__dirname, "bin", "avail-light-client.exe"),
      );
    }
  } else if (binaryLink.endsWith(".tar.gz")) {
    console.log("Extracting tar.gz file...");
    console.log(tempPath);
    console.log(binDir);
    await tar.x({
      file: tempPath,
      cwd: binDir,
    }).catch((err) => {
      throw new Error(`Failed to extract tar.gz file: ${err.message}`);
    });

    // Verify extraction was successful
    const extractedFiles = fs.readdirSync(binDir);
    console.log(extractedFiles);
    if (extractedFiles.length === 0) {
      throw new Error("No files were extracted from the tar.gz archive");
    }

    const binaryName = os.platform() === "win32"
      ? "avail-light-client.exe"
      : "avail-light-client";
    if (extractedFiles.length > 0 && extractedFiles[0] !== binaryName) {
      fs.renameSync(
        path.join(binDir, extractedFiles[0]),
        path.join(binDir, binaryName),
      );
    }

    // Ensure the binary exists
    if (!fs.existsSync(path.join(binDir, binaryName))) {
      throw new Error(
        `Extracted files do not contain expected binary: ${binaryName}`,
      );
    }
  }
  console.log("Binary extracted successfully at " + binDir);
  fs.unlinkSync(tempPath);

  const binaryPath = getBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at expected path: ${binaryPath}`);
  }

  ensureExecutable(binaryPath);

  console.log("Binary ready at:", binaryPath);
  return binaryPath;
};

const runBinary = (args) => {
  const binaryPath = getBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `Binary not found at path: ${binaryPath}. Please run downloadBinary first.`,
    );
  }
  console.log("Running binary at:", binaryPath);
  console.log("Args:", args);
  console.log("CWD:", process.cwd());
  const child = spawn(binaryPath, args, { stdio: "inherit" });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Binary process exited with code ${code}`);
    }
  });
};

module.exports = {
  getBinaryKey,
  getBinaryLink,
  getBinaryPath,
  downloadBinary,
  runBinary,
};
