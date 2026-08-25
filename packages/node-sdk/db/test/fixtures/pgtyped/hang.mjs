import { readFileSync } from "node:fs";

const configIndex = process.argv.indexOf("-c");
const configPath = configIndex === -1 ? undefined : process.argv[configIndex + 1];
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.db.host !== "127.0.0.1" || !Number.isInteger(config.db.port)) {
  console.error("unexpected pgtyped connection config");
  process.exit(2);
}
console.log(`PGTYPED_CONFIG_PATH:${configPath}`);
console.log("PGTYPED_INJECTED_HANG");
setInterval(() => {}, 1_000);
