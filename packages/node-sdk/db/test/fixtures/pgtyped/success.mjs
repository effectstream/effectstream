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
if (config.db.user !== "postgres" || config.db.dbName !== "postgres") {
  console.error("unexpected pgtyped user or database");
  process.exit(4);
}
if (
  config.customMarker !== "quoted \"value\" with newline\nand unicode ✓" ||
  config.db.password !== "special ✓ password" ||
  config.db.ssl !== false ||
  "dbUrl" in config
) {
  console.error("derived pgtyped config did not preserve its shape safely");
  process.exit(5);
}
console.log(`PGTYPED_CONNECTION_OK:${port}`);
console.log("PGTYPED_CONFIG_SHAPE_OK");
console.log(`PGTYPED_CONFIG_PATH:${configPath}`);
