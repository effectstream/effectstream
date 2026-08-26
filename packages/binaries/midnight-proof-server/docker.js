const { spawn, exec, execSync } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const IMAGE_NAME = "midnightntwrk/proof-server";
const IMAGE_TAG = "9.0.0-rc.5";
const CONTAINER_NAME = "midnight-proof-server";

async function checkIfDockerExists() {
  try {
    await execAsync("docker --version");
    return true;
  } catch {
    return false;
  }
}

async function pullDockerImage(tag = IMAGE_TAG) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", `${IMAGE_NAME}:${tag}`], {
      stdio: "inherit",
    });
    child.on(
      "exit",
      (
        code,
      ) => (code === 0
        ? resolve()
        : reject(new Error(`docker pull exited with ${code}`))),
    );
    child.on("error", reject);
  });
}

/**
 * Checks if a container with the given name exists (running or stopped)
 * @param {string} containerName - Name of the container to check
 * @returns {Promise<boolean>} True if container exists, false otherwise
 */
async function checkIfContainerExists(containerName) {
  try {
    const { stdout } = await execAsync(
      `docker ps -aq -f name=^${containerName}$`,
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Checks if a container is currently running
 * @param {string} containerName - Name of the container to check
 * @returns {Promise<boolean>} True if container is running, false otherwise
 */
async function checkIfContainerRunning(containerName) {
  try {
    const { stdout } = await execAsync(
      `docker ps -q -f name=^${containerName}$`,
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Runs the proof server container. Maps port 6300 by default. Additional CLI args are passed as command args.
 * @param {Object} env Env vars to set inside container.
 * @param {Array<string>} args CLI args.
 * @param {string} tag Docker tag.
 */
async function runDockerContainer(
  env = process.env,
  args = [],
  tag = IMAGE_TAG,
) {
  const containerExists = await checkIfContainerExists(CONTAINER_NAME);
  const containerRunning = await checkIfContainerRunning(CONTAINER_NAME);

  if (containerRunning) {
    console.log(`Container ${CONTAINER_NAME} is already running`);
    // Attach to the running container to see logs
    const child = spawn("docker", ["logs", "-f", CONTAINER_NAME], {
      stdio: "inherit",
    });
    return child;
  }

  if (containerExists) {
    console.log(`Starting existing container: ${CONTAINER_NAME}`);
    const child = spawn("docker", ["start", "-a", CONTAINER_NAME], {
      stdio: "inherit",
    });
    return child;
  }

  // Container doesn't exist, create and run new one
  console.log(`Creating new container: ${CONTAINER_NAME}`);

  const dockerArgs = [
    "run",
    "--name",
    CONTAINER_NAME,
    "-p",
    "6300:6300",
  ];

  // pass env vars
  Object.entries(env).forEach(([k, v]) => {
    if (v) dockerArgs.push("-e", `${k}=${v}`);
  });

  dockerArgs.push(`${IMAGE_NAME}:${tag}`);

  if (args.length > 0) dockerArgs.push(...args);

  console.log(
    `Running proof server with Docker: docker ${dockerArgs.join(" ")}`,
  );
  const child = spawn("docker", dockerArgs, { stdio: "inherit" });
  return child;
}

module.exports = { checkIfDockerExists, pullDockerImage, runDockerContainer };
