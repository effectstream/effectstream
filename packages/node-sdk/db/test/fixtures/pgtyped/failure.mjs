import { readFileSync } from "node:fs";

const configIndex = process.argv.indexOf("-c");
const configPath = configIndex === -1 ? undefined : process.argv[configIndex + 1];
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.db.host !== "127.0.0.1") {
  console.error(`unexpected pgtyped host: ${String(config.db.host)}`);
  process.exit(2);
}
const port = Number(config.db.port);
if (!Number.isInteger(port) || port <= 0 || port === 5432) {
  console.error(`pgtyped did not receive the reported ephemeral port: ${port}`);
  process.exit(3);
}
console.log(`PGTYPED_CONFIG_PATH:${configPath}`);
console.error("PGTYPED_INJECTED_FAILURE");
process.exit(23);
