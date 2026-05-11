import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import * as fs from "node:fs/promises";

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
  await fs.writeFile(filePath, JSON.stringify(json, null, 2), "utf-8");

  return filePath;
}

async function updateDolosConfig() {
  const paths = await Promise.all(
    Object.keys(GENESIS_ENDPOINTS).map((type) =>
      fetchAndSaveGenesis(type as keyof typeof GENESIS_ENDPOINTS)
    ),
  );

  const templateContent = await fs.readFile(TEMPLATE_FILE, "utf-8");
  const config = parseToml(templateContent);

  // Dolos/Pallas can't parse the array-format cost models from YACI.
  // Create a minimal alonzo genesis with named cost model keys.
  // https://github.com/txpipe/pallas/issues/296#issuecomment-2547962797
  const alonzoGenesis = JSON.parse(await fs.readFile(paths[2], "utf-8"));
  const alonzo2 = { ...alonzoGenesis };
  delete alonzo2.costModels;
  alonzo2.costModels = { PlutusV1: {} };
  const alonzo2Path = `${TEMP_DIR}/alonzo-genesis2.json`;
  await fs.writeFile(alonzo2Path, JSON.stringify(alonzo2, null, 2), "utf-8");

  config.genesis = {
    ...(config.genesis as Record<string, unknown>),
    byron_path: paths[0],
    shelley_path: paths[1],
    alonzo_path: alonzo2Path,
    conway_path: paths[3],
  };

  await fs.writeFile(FINAL_TOML, stringifyToml(config), "utf-8");
}

await updateDolosConfig();
