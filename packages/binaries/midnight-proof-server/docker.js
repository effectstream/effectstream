const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const {
  DEFAULT_VERSION,
  DEFAULT_PORT,
  containerNameForPort,
  imageRef,
  dockerRunArgs,
  redactDockerArgs,
} = require("./config.js");

async function checkIfDockerExists() {
  try {
    await execAsync("docker --version");
    return true;
  } catch {
    return false;
  }
}

async function pullDockerImage(tag = DEFAULT_VERSION) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", imageRef(tag)], {
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
 * Image reference an existing container was created from, or undefined.
 * @param {string} containerName
 * @returns {Promise<string | undefined>}
 */
async function getContainerImage(containerName) {
  try {
    const { stdout } = await execAsync(
      `docker inspect -f '{{.Config.Image}}' ${containerName}`,
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The container name only encodes the port, so an existing container on that
 * port may run another proof-server version. On a non-default port that is
 * refused. On the default port it is only a warning, which keeps the
 * historical behavior of reusing `midnight-proof-server` as it is.
 */
async function assertContainerImage(containerName, tag, port) {
  const image = await getContainerImage(containerName);
  if (!image || image === imageRef(tag)) return;
  const message =
    `Container ${containerName} exists with image ${image}, but ${imageRef(tag)} ` +
    `was requested. Remove that container or choose another --port.`;
  if (port === DEFAULT_PORT) {
    console.warn(`WARNING: ${message}`);
    return;
  }
  throw new Error(message);
}

/**
 * Runs the proof server container. Maps host port 6300 by default (`--port` /
 * MIDNIGHT_PROOF_SERVER_PORT selects another one; the container is then named
 * `midnight-proof-server-<port>`). Additional CLI args are passed as command args.
 * @param {Object} env Env vars to set inside container.
 * @param {Array<string>} args CLI args.
 * @param {string} tag Docker tag (the proof-server version).
 * @param {number} port Host port.
 */
async function runDockerContainer(
  env = process.env,
  args = [],
  tag = DEFAULT_VERSION,
  port = DEFAULT_PORT,
) {
  const containerName = containerNameForPort(port);
  const containerExists = await checkIfContainerExists(containerName);
  const containerRunning = await checkIfContainerRunning(containerName);

  if (containerExists || containerRunning) {
    await assertContainerImage(containerName, tag, port);
  }

  if (containerRunning) {
    console.log(`Container ${containerName} is already running`);
    // Attach to the running container to see logs
    const child = spawn("docker", ["logs", "-f", containerName], {
      stdio: "inherit",
    });
    return child;
  }

  if (containerExists) {
    console.log(`Starting existing container: ${containerName}`);
    const child = spawn("docker", ["start", "-a", containerName], {
      stdio: "inherit",
    });
    return child;
  }

  // Container doesn't exist, create and run new one
  console.log(`Creating new container: ${containerName}`);

  const dockerArgs = dockerRunArgs({ env, args, version: tag, port });

  // Env values are redacted: the whole environment is forwarded (00050 E7).
  console.log(
    `Running proof server with Docker: docker ${redactDockerArgs(dockerArgs).join(" ")}`,
  );
  const child = spawn("docker", dockerArgs, { stdio: "inherit" });
  return child;
}

module.exports = { checkIfDockerExists, pullDockerImage, runDockerContainer };
