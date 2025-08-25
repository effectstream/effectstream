import { parse as parseToml, stringify as stringifyToml } from "toml";
import fs from "node:fs/promises";

const TEMP_DIR = "./temp";
const TEMPLATE_FILE = "./dolos.template.toml";
const FINAL_TOML = "./dolos.toml";
const BASE_URL = (hostname: string, port: number) =>
  `http://${hostname}:${port}/local-cluster/api/admin/devnet`;
const GENESIS_ENDPOINTS = {
  byron: BASE_URL("localhost", 10000) + "/genesis/byron",
  shelley: BASE_URL("localhost", 10000) + "/genesis/shelley",
  alonzo: BASE_URL("localhost", 10000) + "/genesis/alonzo",
  conway: BASE_URL("localhost", 10000) + "/genesis/conway",
};

async function fetchAndSaveGenesis(
  type: keyof typeof GENESIS_ENDPOINTS,
): Promise<string> {
  const response = await fetch(GENESIS_ENDPOINTS[type]);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${type} genesis: ${response.statusText}`);
  }

  const json = await response.json();
  const filePath = `${TEMP_DIR}/${type}-genesis.json`;

  await fs.mkdir(TEMP_DIR, { recursive: true });
  await Deno.writeTextFile(filePath, JSON.stringify(json, null, 2));

  return filePath;
}

async function updateDolosConfig() {
  // Fetch and save all genesis files
  const paths = await Promise.all(
    Object.keys(GENESIS_ENDPOINTS).map((type) =>
      fetchAndSaveGenesis(type as keyof typeof GENESIS_ENDPOINTS)
    ),
  );

  // Read the template file
  const templateContent = await Deno.readTextFile(TEMPLATE_FILE);
  const config = parseToml(templateContent);

  // Update genesis paths
  config.genesis = {
    byron_path: paths[0],
    shelley_path: paths[1],
    alonzo_path: "./temp/alonzo-genesis2.json", // https://github.com/txpipe/pallas/issues/296#issuecomment-2547962797
    conway_path: paths[3],
  };

  // Write updated config back to file
  await Deno.writeTextFile(FINAL_TOML, stringifyToml(config));
}

// Execute the update
await updateDolosConfig();
