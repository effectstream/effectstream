const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

/**
 * Resolves the SQLite database path using the midnight-indexer configuration rules
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 * @returns {string|null} The resolved SQLite database path, or null if not found
 */
function resolveSqlitePath(env, workingDir) {
  // First check the APP__INFRA__STORAGE__CNN_URL environment variable
  const envCnnUrl = env.APP__INFRA__STORAGE__CNN_URL;
  if (envCnnUrl) {
    console.log(`Found SQLite path from environment variable: ${envCnnUrl}`);
    return envCnnUrl;
  }

  // Determine config file path using the configuration resolution rules
  let configPath;
  if (env.CONFIG_FILE) {
    configPath = path.isAbsolute(env.CONFIG_FILE)
      ? env.CONFIG_FILE
      : path.resolve(workingDir, env.CONFIG_FILE);
  } else {
    // Fall back to config.yaml in the current working directory
    configPath = path.join(workingDir, "config.yaml");
  }

  console.log(`Looking for config file at: ${configPath}`);

  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    console.warn(`Config file not found at: ${configPath}`);
    return null;
  }

  try {
    // Parse the YAML config file
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = yaml.load(configContent);

    // Extract the cnn_url from infra.storage
    const cnnUrl = config?.infra?.storage?.cnn_url;
    if (!cnnUrl) {
      console.warn("No cnn_url found in config file under infra.storage");
      return null;
    }

    console.log(`Found SQLite path from config file: ${cnnUrl}`);

    // If the path is relative, make it relative to the config file location
    if (!path.isAbsolute(cnnUrl)) {
      const configDir = path.dirname(configPath);
      const resolvedPath = path.resolve(configDir, cnnUrl);
      console.log(`Resolved relative path to: ${resolvedPath}`);
      return resolvedPath;
    }

    return cnnUrl;
  } catch (error) {
    console.error(`Failed to parse config file: ${error.message}`);
    return null;
  }
}

/**
 * Handles the --clean flag by deleting the SQLite database file
 * @param {Object} env - Environment variables
 * @param {string} workingDir - The working directory where the indexer runs
 */
function handleCleanFlag(env, workingDir) {
  console.log("Processing --clean flag...");

  const sqlitePath = resolveSqlitePath(env, workingDir);

  if (!sqlitePath) {
    console.warn("Could not resolve SQLite database path. Skipping cleanup.");
    return;
  }

  // Handle sqlite:// URLs and extract the file path
  let filePath = sqlitePath;
  if (sqlitePath.startsWith("sqlite://")) {
    filePath = sqlitePath.replace("sqlite://", "");
  } else if (sqlitePath.startsWith("sqlite:///")) {
    filePath = sqlitePath.replace("sqlite:///", "/");
  }

  console.log(`Attempting to clean SQLite database at: ${filePath}`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Successfully deleted SQLite database: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete SQLite database: ${error.message}`);
    }
  } else {
    console.log(
      `SQLite database does not exist (will be created fresh): ${filePath}`,
    );
  }
}

/**
 * Executes the midnight-indexer binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightIndexer(env = process.env, args = []) {
  const binaryPath = path.join(
    __dirname,
    "indexer-standalone",
    "indexer-standalone",
  );
  const workingDir = path.join(__dirname, "indexer-standalone");

  // Check for --clean flag and handle it
  const cleanFlagIndex = args.indexOf("--clean");
  if (cleanFlagIndex !== -1) {
    handleCleanFlag(env, workingDir);
    // Remove the --clean flag from args since the binary doesn't expect it
    args.splice(cleanFlagIndex, 1);
  }

  console.log(`Starting midnight-indexer binary at: ${binaryPath}`);

  const childProcess = spawn(binaryPath, args, {
    env: env,
    stdio: "inherit", // Inherit stdin, stdout, stderr from parent process
    cwd: workingDir, // Run from inside the indexer-standalone directory
  });

  childProcess.on("spawn", () => {
    console.log(
      `midnight-indexer process spawned with PID: ${childProcess.pid}`,
    );
  });

  childProcess.on("error", (error) => {
    console.error("Failed to start midnight-indexer:", error);
  });

  childProcess.on("exit", (code, signal) => {
    if (code !== null) {
      console.log(`midnight-indexer process exited with code: ${code}`);
    } else {
      console.log(`midnight-indexer process terminated by signal: ${signal}`);
    }
  });

  return childProcess;
}

module.exports = { runMidnightIndexer };
