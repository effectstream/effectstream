const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const IMAGE_NAME = "midnightntwrk/proof-server";
const IMAGE_TAG = "9.0.0-rc.5";
const CONTAINER_NAME = "midnight-proof-server";
const DEFAULT_DEPENDENCIES = { spawn, execFileAsync };

function getImageReference(tag = IMAGE_TAG) {
  return `${IMAGE_NAME}:${tag}`;
}

function describeCommandError(error) {
  if (error && typeof error === "object") {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const message = typeof error.message === "string" ? error.message : "";
    return stderr || message || String(error);
  }
  return String(error);
}

function parseDockerInspect(stdout, subject) {
  let records;
  try {
    records = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Docker returned invalid inspection data for ${subject}: ${error.message}`,
    );
  }
  if (!Array.isArray(records) || records.length !== 1 || !records[0]) {
    throw new Error(`Docker returned no unambiguous inspection record for ${subject}`);
  }
  return records[0];
}

async function inspectDockerImage(reference, dependencies = DEFAULT_DEPENDENCIES) {
  try {
    const { stdout } = await dependencies.execFileAsync(
      "docker",
      ["image", "inspect", reference],
    );
    const image = parseDockerInspect(stdout, `image ${reference}`);
    if (typeof image.Id !== "string" || image.Id.length === 0) {
      throw new Error(`Docker image ${reference} has no immutable image ID`);
    }
    return { reference, imageId: image.Id };
  } catch (error) {
    throw new Error(
      `Unable to inspect pulled target image ${reference}: ${describeCommandError(error)}`,
    );
  }
}

async function inspectExistingContainer(
  containerName,
  dependencies = DEFAULT_DEPENDENCIES,
) {
  try {
    const { stdout } = await dependencies.execFileAsync(
      "docker",
      ["container", "inspect", containerName],
    );
    return parseDockerInspect(stdout, `container ${containerName}`);
  } catch (error) {
    const details = describeCommandError(error);
    if (/no such (?:object|container)/i.test(details)) return null;
    throw new Error(
      `Unable to inspect existing container ${containerName}; refusing to create, ` +
        `attach, start, stop, or remove it: ${details}`,
    );
  }
}

function assertContainerImageIdentity(container, targetImage) {
  const configuredReference = container?.Config?.Image;
  const actualImageId = container?.Image;
  if (
    configuredReference === targetImage.reference &&
    actualImageId === targetImage.imageId
  ) {
    return;
  }

  throw new Error(
    `Refusing to reuse Docker container ${CONTAINER_NAME}: expected image reference ` +
      `${targetImage.reference} at immutable image ID ${targetImage.imageId}, but found ` +
      `reference ${configuredReference ?? "<missing>"} at image ID ` +
      `${actualImageId ?? "<missing>"}. Remove or rename the stale shared container ` +
      `yourself, then retry. The wrapper did not attach, start, stop, or remove it.`,
  );
}

async function checkIfDockerExists(dependencies = DEFAULT_DEPENDENCIES) {
  try {
    await dependencies.execFileAsync("docker", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function pullDockerImage(tag = IMAGE_TAG, dependencies = DEFAULT_DEPENDENCIES) {
  const reference = getImageReference(tag);
  await new Promise((resolve, reject) => {
    const child = dependencies.spawn("docker", ["pull", reference], {
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
  return inspectDockerImage(reference, dependencies);
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
  pulledTargetImage,
  dependencies = DEFAULT_DEPENDENCIES,
) {
  const expectedReference = getImageReference(tag);
  const targetImage = pulledTargetImage ??
    await inspectDockerImage(expectedReference, dependencies);
  if (
    targetImage.reference !== expectedReference ||
    typeof targetImage.imageId !== "string" ||
    targetImage.imageId.length === 0
  ) {
    throw new Error(
      `Invalid pulled target identity for ${expectedReference}: ` +
        `${JSON.stringify(targetImage)}`,
    );
  }
  const existingContainer = await inspectExistingContainer(
    CONTAINER_NAME,
    dependencies,
  );

  if (existingContainer) {
    assertContainerImageIdentity(existingContainer, targetImage);
  }

  if (existingContainer?.State?.Running === true) {
    console.log(`Container ${CONTAINER_NAME} is already running`);
    // Attach to the running container to see logs
    const child = dependencies.spawn("docker", ["logs", "-f", CONTAINER_NAME], {
      stdio: "inherit",
    });
    return child;
  }

  if (existingContainer) {
    console.log(`Starting existing container: ${CONTAINER_NAME}`);
    const child = dependencies.spawn("docker", ["start", "-a", CONTAINER_NAME], {
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

  dockerArgs.push(expectedReference);

  if (args.length > 0) dockerArgs.push(...args);

  console.log(
    `Running proof server with Docker: docker ${dockerArgs.join(" ")}`,
  );
  const child = dependencies.spawn("docker", dockerArgs, { stdio: "inherit" });
  return child;
}

module.exports = { checkIfDockerExists, pullDockerImage, runDockerContainer };
