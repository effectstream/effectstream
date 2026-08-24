/**
 * IMPORTANT:
 * This is BACKEND / EFFECTSTREAM only import.
 * This should not be imported in frontend code as it will leak sensitive information.
 *
 * Usage:
 * import { ENV } from "@effectstream/utils/node-env";
 */

// NOTE: To register a new config, we need to add it in the definitions, and then add the getter in the ENV class.
// TODO: Is it possible to do this automatically, or just once?
import dotenv from "dotenv";
import { getEnv, setEnv } from "./runtime.ts";

const MIDNIGHT_STORAGE_PASSWORD_DEFAULT = 'YourPasswordMy1!';

const EFFECTSTREAM_ENV = getEnv("EFFECTSTREAM_ENV");
if (EFFECTSTREAM_ENV) {
  dotenv.config({
    path: `.env.${EFFECTSTREAM_ENV}`,
    override: true,
  });
}

export type ConfigDefinition = {
  // Unique identifier for the config.
  key: string;
  // Whether the config is a secret value (it hides it from the terminal-interface).
  isSecret?: boolean;
  // Description of the config.
  description: string;
  // Whether the config is a system config and not managed by the user.
  isSystem?: boolean;
} & ({
  type: "string"
  defaultValue: string | undefined;
} | {
  type: "number";
  defaultValue: number | undefined;
} | {
  type: "boolean";
  defaultValue: boolean | undefined;
});

const definitions: Record<string, ConfigDefinition> = {
  EFFECTSTREAM_ENV: {
    key: "EFFECTSTREAM_ENV",
    type: "string",
    defaultValue: undefined,
    description: "Effectstream Environment. Example: 'local' or 'testnet'",
  },
  DB_HOST: {
    key: "DB_HOST",
    type: "string",
    defaultValue: "localhost",
    description: "Paima Engine Postgres Host URL. Example: 'localhost'",
  },
  DB_NAME: {
    key: "DB_NAME",
    type: "string",
    defaultValue: "postgres",
    description: "Paima Engine Postgres Database Name. Example: 'postgres'",
  },
  DB_PORT: {
    key: "DB_PORT",
    type: "number",
    defaultValue: 5432,
    description: "Paima Engine Postgres Port. Example: '5432'",
  },
  DB_PW: {
    key: "DB_PW",
    isSecret: true,
    type: "string",
    defaultValue: "postgres",
    description: "Paima Engine Postgres Password. Example: 'password'",
  },
  DB_USER: {
    key: "DB_USER",
    type: "string",
    defaultValue: "postgres",
    description: "Paima Engine Postgres User. Example: 'postgres'",
  },
  NODE_ENV: {
    key: "NODE_ENV",
    type: "string",
    defaultValue: undefined,
    description: "Node Environment. Example: 'development' or 'production'",
  },
  ORCHESTRATOR_URL: {
    key: "ORCHESTRATOR_URL",
    type: "string",
    defaultValue: "http://localhost",
    description: "Paima Engine Orchestrator URL. Example: 'http://localhost'",
  },
  ORCHESTRATOR_PORT: {
    key: "ORCHESTRATOR_PORT",
    type: "number",
    defaultValue: 0,
    description:
      "Paima Engine Orchestrator Port. Used by the TUI to monitor processes. Example: '3000'",
  },
  TUI_LOG_URL: {
    key: "TUI_LOG_URL",
    type: "string",
    defaultValue: "http://localhost",
    description: "TUI Log URL. Example: 'http://localhost'",
  },
  TUI_LOG_PORT: {
    key: "TUI_LOG_PORT",
    type: "number",
    defaultValue: 11033,
    description: "TUI Log Port. Example: '11033'",
  },
  SHELL: {
    isSystem: true,
    key: "SHELL",
    type: "string",
    defaultValue: undefined,
    description:
      "System shell path. This is set by the OS. Used to run TUI/tmux commands",
  },
  TMUX: {
    isSystem: true,
    key: "TMUX",
    type: "string",
    defaultValue: undefined,
    description:
      "System tmux path. This is set by Tmux itself. Used to check if the process is running in a tmux session",
  },
  RECAPTCHA_V3_FRONTEND: {
    key: "RECAPTCHA_V3_FRONTEND",
    type: "string",
    defaultValue: undefined,
    description:
      "ReCaptcha V3 Frontend Key. Used by the Batcher to verify requests. Leave empty to disable. Example: '6Lc123456789012345678901234567890'",
  },
  BATCHER_PORT: {
    key: "BATCHER_PORT",
    type: "number",
    defaultValue: 3334,
    description: "Batcher Port. Example: '3334'",
  },
  BATCHER_DB_SCHEMA: {
    key: "BATCHER_DB_SCHEMA",
    type: "string",
    defaultValue: undefined,
    description:
      "Schema SUFFIX owned by this batcher in the shared engine database (DB_HOST/DB_PORT/DB_USER/DB_NAME). " +
      "The code applies the fixed 'batcher_' prefix, so 'chess_v2' means the schema 'batcher_chess_v2'; " +
      "the value must match ^[a-z0-9_]{1,55}$ (lowercase letters, digits and underscores; 55 chars is Postgres' " +
      "63-character identifier budget minus the prefix). Setting it is what enables durable request tracking: " +
      "the batcher connects to the engine's database and owns that schema. An invalid value, or a database it " +
      "cannot reach, REFUSES TO BOOT rather than silently running untracked. Leaving it unset (or empty) falls " +
      "back to queue-only FileStorage in ./batcher-data with NO request tracking, NO replay/dedup double-payment " +
      "protection and NO GET /input-status — development only; production deployments must set this. " +
      "Example: 'chess_v2'",
  },
  STORE_HISTORICAL_GAME_INPUTS: {
    key: "STORE_HISTORICAL_GAME_INPUTS",
    type: "boolean",
    defaultValue: true,
    description: "Store Historical Game Inputs. Example: 'true' or 'false'",
  },
  MQTT_BROKER: {
    key: "MQTT_BROKER",
    type: "boolean",
    defaultValue: true,
    description: "MQTT Broker. Example: 'true' or 'false'",
  },
  MQTT_ENGINE_BROKER_URL: {
    key: "MQTT_ENGINE_BROKER_URL",
    type: "string",
    defaultValue: "mqtt://127.0.0.1:8883",
    description: "MQTT Engine Broker TCP URL. Example: 'mqtt://127.0.0.1:8883'",
  },
  MQTT_ENGINE_BROKER_PORT: {
    key: "MQTT_ENGINE_BROKER_PORT",
    type: "number",
    defaultValue: 8883,
    description: "MQTT Engine Broker TCP Port. Example: '8883'",
  },
  MQTT_ENGINE_BROKER_WS_URL: {
    key: "MQTT_ENGINE_BROKER_WS_URL",
    type: "string",
    defaultValue: "ws://127.0.0.1:9883",
    description: "MQTT Engine Broker WebSocket URL (for browser clients). Example: 'ws://127.0.0.1:9883'",
  },
  MQTT_ENGINE_BROKER_WS_PORT: {
    key: "MQTT_ENGINE_BROKER_WS_PORT",
    type: "number",
    defaultValue: 9883,
    description: "MQTT Engine Broker WebSocket Port. Example: '9883'",
  },
  MQTT_BATCHER_BROKER_URL: {
    key: "MQTT_BATCHER_BROKER_URL",
    type: "string",
    defaultValue: "mqtt://127.0.0.1:8884",
    description: "MQTT Batcher Broker TCP URL. Example: 'mqtt://127.0.0.1:8884'",
  },
  MQTT_BATCHER_BROKER_PORT: {
    key: "MQTT_BATCHER_BROKER_PORT",
    type: "number",
    defaultValue: 8884,
    description: "MQTT Batcher Broker TCP Port. Example: '8884'",
  },
  MQTT_BATCHER_BROKER_WS_URL: {
    key: "MQTT_BATCHER_BROKER_WS_URL",
    type: "string",
    defaultValue: "ws://127.0.0.1:9884",
    description: "MQTT Batcher Broker WebSocket URL (for browser clients). Example: 'ws://127.0.0.1:9884'",
  },
  MQTT_BATCHER_BROKER_WS_PORT: {
    key: "MQTT_BATCHER_BROKER_WS_PORT",
    type: "number",
    defaultValue: 9884,
    description: "MQTT Batcher Broker WebSocket Port. Example: '9884'",
  },
  EFFECTSTREAM_API_PORT: {
    key: "EFFECTSTREAM_API_PORT",
    type: "number",
    defaultValue: 9999,
    description:
      "Main Paima API Port. Used by developers custom endpoints and RPC endpoints. Example: '9999'",
  },
  EFFECTSTREAM_EXPLORER_PORT: {
    key: "EFFECTSTREAM_EXPLORER_PORT",
    type: "number",
    defaultValue: 10590,
    description: "Explorer Port. Example: '10590'",
  },
  EFFECTSTREAM_CHAIN_ID: {
    key: "EFFECTSTREAM_CHAIN_ID",
    type: "number",
    defaultValue: 87401284021,
    description: "Paima Chain ID. Example: '87401284021'",
  },
  PGLITE: {
    key: "PGLITE",
    type: "boolean",
    defaultValue: true,
    description:
      "Enable single connection mode and other specific PGLite features. IMPORTANT enable only for development. ('true' or 'false')",
  },
  PGLITE_DATA_DIR: {
    key: "PGLITE_DATA_DIR",
    type: "string",
    defaultValue: "memory://",
    description:
      "PGLite data directory. Use 'memory://' for in-memory (default) or a file path for persistent storage. Example: './pglite-data'",
  },
  DEBUG_PGLITE: {
    key: "DEBUG_PGLITE",
    type: "number",
    defaultValue: undefined,
    description: "Enable PGLite Debug/Verbose mode. Example: '1'",
  },
  ALLOW_NO_PG_IVM: {
    key: "ALLOW_NO_PG_IVM",
    type: "boolean",
    defaultValue: false,
    description:
      "Permits the engine to start when the pg_ivm extension is not installed, falling back to plain SQL views over the trigger-maintained intermediate tables. Intended for dev/test and low-volume apps only — the fallback degrades sharply on high-cardinality data. Production deployments should install pg_ivm. ('true' or 'false')",
  },
  OTEL_COLLECTOR_PORT: {
    key: "OTEL_COLLECTOR_PORT",
    type: "number",
    defaultValue: 4318,
    description: "OTEL Collector Port. Example: '4318'",
  },
  DOCS_PORT: {
    key: "DOCS_PORT",
    type: "number",
    defaultValue: 10600,
    description: "Docs Port. Example: '10600'",
  },
  MIDNIGHT_STORAGE_PASSWORD: {
    key: "MIDNIGHT_STORAGE_PASSWORD",
    isSecret: true,
    type: "string",
    defaultValue: MIDNIGHT_STORAGE_PASSWORD_DEFAULT,
    description: "Midnight Storage Password. Used to run the new node version or deploy contracts on Midnight. A random 16-character hex string is generated if not provided.",
  },
  API_KEY_OPEN_ENDPOINTS_EXPLORER: {
    key: "API_KEY_OPEN_ENDPOINTS_EXPLORER",
    isSecret: true,
    type: "string",
    defaultValue: "effectstream_api_explorer_endpoints_password",
    description:
      "API key to access open explorer endpoints (tables, primitives, addresses, scheduled-data).",
  },
  ENABLE_DEV_AND_DEBUG_ENDPOINTS: {
    key: "ENABLE_DEV_AND_DEBUG_ENDPOINTS",
    type: "boolean",
    defaultValue: false,
    description:
      "Enable developer and debug endpoints (/debug/sync-protocols, /config, /db_acquire_lock, /db_release_lock, /force-batch, /clear-inputs). Should be disabled in production.",
  },
  EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS: {
    key: "EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS",
    type: "number",
    defaultValue: undefined,
    description:
      "Wall-clock seconds between automated pg_dump snapshots. Leaving this unset disables snapshots entirely. Example: '3600' (1 hour).",
  },
  EFFECTSTREAM_SNAPSHOT_PATH: {
    key: "EFFECTSTREAM_SNAPSHOT_PATH",
    type: "string",
    defaultValue: "./snapshots",
    description: "Output directory for snapshot .dump files. Example: './backups'",
  },
  EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY: {
    key: "EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY",
    type: "boolean",
    defaultValue: true,
    description:
      "Snapshot retention: keep one snapshot per hour for the last 24 hours. Set to 'false' to disable this tier.",
  },
  EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY: {
    key: "EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY",
    type: "boolean",
    defaultValue: true,
    description:
      "Snapshot retention: keep one snapshot per 6-hour window for the last 3 days. Set to 'false' to disable this tier.",
  },
  EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS: {
    key: "EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS",
    type: "number",
    defaultValue: 7,
    description:
      "Snapshot retention: keep one snapshot per day for this many days. Snapshots older than this are deleted. Default: 7.",
  },
  EFFECTSTREAM_COALESCE_EMPTY_BLOCKS: {
    key: "EFFECTSTREAM_COALESCE_EMPTY_BLOCKS",
    type: "boolean",
    defaultValue: false,
    description:
      "Fold consecutive empty catch-up blocks into one DB transaction when behind the chain tip. Default: false.",
  },
  EFFECTSTREAM_LAG_THRESHOLD_MS: {
    key: "EFFECTSTREAM_LAG_THRESHOLD_MS",
    type: "number",
    defaultValue: undefined,
    description:
      "Override the lag threshold (ms) that gates empty-block coalescing and lag logging. When unset, defaults to 20× the main clock's block time, falling back to 60 s when no blockTimeMS is exposed.",
  },
  EFFECTSTREAM_FINALIZED_STREAM_CAP: {
    key: "EFFECTSTREAM_FINALIZED_STREAM_CAP",
    type: "number",
    defaultValue: 2048,
    description:
      "Backpressure cap on the in-memory finalized-block queue between the merge and the runtime apply loop. The merge blocks once this many produced blocks are unconsumed, bounding memory during deep catch-up. Default: 2048.",
  },
} as const;

type ENV_TYPES = string | number | boolean | undefined;

export class ENV {
  static get EFFECTSTREAM_ENV(): string {
    return ENV.getConfig(definitions.EFFECTSTREAM_ENV);
  }
  static get MQTT_BROKER(): boolean {
    return ENV.getConfig(definitions.MQTT_BROKER);
  }
  static get MQTT_ENGINE_BROKER_PORT(): number {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_PORT);
  }
  static get MQTT_ENGINE_BROKER_WS_PORT(): number {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_WS_PORT);
  }
  static get MQTT_BATCHER_BROKER_PORT(): number {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_PORT);
  }
  static get MQTT_BATCHER_BROKER_WS_PORT(): number {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_WS_PORT);
  }
  static get MQTT_ENGINE_BROKER_URL(): string {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_URL);
  }
  static get MQTT_ENGINE_BROKER_WS_URL(): string {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_WS_URL);
  }
  static get MQTT_BATCHER_BROKER_URL(): string {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_URL);
  }
  static get MQTT_BATCHER_BROKER_WS_URL(): string {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_WS_URL);
  }
  static get DB_HOST(): string {
    return ENV.getConfig(definitions.DB_HOST);
  }
  static get DB_NAME(): string {
    return ENV.getConfig(definitions.DB_NAME);
  }
  static get DB_PORT(): number {
    return ENV.getConfig(definitions.DB_PORT);
  }
  static get DB_PW(): string {
    return ENV.getConfig(definitions.DB_PW);
  }
  static get DB_USER(): string {
    return ENV.getConfig(definitions.DB_USER);
  }
  static get NODE_ENV(): string {
    return ENV.getConfig(definitions.NODE_ENV);
  }
  static get ORCHESTRATOR_URL(): string {
    return ENV.getConfig(definitions.ORCHESTRATOR_URL);
  }
  static get ORCHESTRATOR_PORT(): number {
    return ENV.getConfig(definitions.ORCHESTRATOR_PORT);
  }
  static set ORCHESTRATOR_PORT(port: number) {
    setEnv(definitions.ORCHESTRATOR_PORT.key, String(port));
  }
  static get TUI_LOG_URL(): string {
    return ENV.getConfig(definitions.TUI_LOG_URL);
  }
  static get TUI_LOG_PORT(): number {
    return ENV.getConfig(definitions.TUI_LOG_PORT);
  }
  static get SHELL(): string {
    return ENV.getConfig(definitions.SHELL);
  }
  static get TMUX(): string {
    return ENV.getConfig(definitions.TMUX);
  }
  static get EFFECTSTREAM_API_PORT(): number {
    return ENV.getConfig(definitions.EFFECTSTREAM_API_PORT);
  }
  static get RECAPTCHA_V3_FRONTEND(): string {
    return ENV.getConfig(definitions.RECAPTCHA_V3_FRONTEND);
  }
  static get BATCHER_PORT(): number {
    return ENV.getConfig(definitions.BATCHER_PORT);
  }
  /**
   * Schema suffix owned by this batcher, or "" when unset.
   *
   * "" and "unset" are deliberately the same answer: `getString` returns
   * `value ?? ""` for a key with no default, and an env var set to the empty
   * string is not nullish, so both arrive here as "". The batcher reads "" as
   * "no schema configured" and falls back to queue-only FileStorage.
   */
  static get BATCHER_DB_SCHEMA(): string {
    return ENV.getConfig(definitions.BATCHER_DB_SCHEMA);
  }
  static get EFFECTSTREAM_EXPLORER_PORT(): number {
    return ENV.getConfig(definitions.EFFECTSTREAM_EXPLORER_PORT);
  }
  static get EFFECTSTREAM_CHAIN_ID(): number {
    return ENV.getConfig(definitions.EFFECTSTREAM_CHAIN_ID);
  }
  static get PGLITE(): boolean {
    return ENV.getConfig(definitions.PGLITE);
  }
  static get PGLITE_DATA_DIR(): string {
    return ENV.getConfig(definitions.PGLITE_DATA_DIR);
  }
  static get DEBUG_PGLITE(): number {
    return ENV.getConfig(definitions.DEBUG_PGLITE);
  }
  static get ALLOW_NO_PG_IVM(): boolean {
    return ENV.getConfig(definitions.ALLOW_NO_PG_IVM);
  }
  static get OTEL_COLLECTOR_PORT(): number {
    return ENV.getConfig(definitions.OTEL_COLLECTOR_PORT);
  }
  static get DOCS_PORT(): number {
    return ENV.getConfig(definitions.DOCS_PORT);
  }
  static get MIDNIGHT_STORAGE_PASSWORD(): string {
    return ENV.getConfig(definitions.MIDNIGHT_STORAGE_PASSWORD);
  }
  static get API_KEY_OPEN_ENDPOINTS_EXPLORER(): string {
    return ENV.getConfig(definitions.API_KEY_OPEN_ENDPOINTS_EXPLORER);
  }
  static get ENABLE_DEV_AND_DEBUG_ENDPOINTS(): boolean {
    return ENV.getConfig(definitions.ENABLE_DEV_AND_DEBUG_ENDPOINTS);
  }
  /**
   * Wall-clock seconds between automated snapshots.
   * Returns `undefined` (env var not set) to signal that snapshots are disabled.
   */
  static get EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS(): number | undefined {
    const raw = getEnv(definitions.EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS.key);
    if (raw == null || raw === "") return undefined;
    return parseInt(raw, 10);
  }
  static get EFFECTSTREAM_SNAPSHOT_PATH(): string {
    return ENV.getConfig(definitions.EFFECTSTREAM_SNAPSHOT_PATH);
  }
  static get EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY(): boolean {
    return ENV.getConfig(definitions.EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY);
  }
  static get EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY(): boolean {
    return ENV.getConfig(definitions.EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY);
  }
  static get EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS(): number {
    return ENV.getConfig(definitions.EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS);
  }
  static get EFFECTSTREAM_COALESCE_EMPTY_BLOCKS(): boolean {
    return ENV.getConfig(definitions.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS);
  }
  static get EFFECTSTREAM_FINALIZED_STREAM_CAP(): number {
    return ENV.getConfig(definitions.EFFECTSTREAM_FINALIZED_STREAM_CAP);
  }
  static get EFFECTSTREAM_LAG_THRESHOLD_MS(): number | undefined {
    const raw = getEnv(definitions.EFFECTSTREAM_LAG_THRESHOLD_MS.key);
    if (raw == null || raw === "") return undefined;
    return parseInt(raw, 10);
  }

  public static getConfig<T>(config: ConfigDefinition): T {
    switch (config.type) {
      case "string":
        return ENV.getString(config.key, config.defaultValue) as T;
      case "number":
        return ENV.getNumber(config.key, config.defaultValue) as T;
      case "boolean":
        return ENV.getBoolean(config.key, config.defaultValue) as T;
      default:
        throw new Error(`Invalid config type: ${config}`);
    }
  }

  static getCurrentConfig(
    showSecrets: boolean = false,
  ): Record<string, ENV_TYPES> {
    const secretPlaceholder = "********";
    const values: Record<string, ENV_TYPES> = {};
    Object.entries(definitions).forEach(([key, config]) => {
      if (config.isSecret) {
        values[key] = showSecrets
          ? ENV[key as keyof typeof ENV] as any
          : secretPlaceholder;
      } else {
        values[key] = ENV[key as keyof typeof ENV] as any;
      }
    });
    return values;
  }

  static getDocumentation(): Record<string, {
    defaultValue: ENV_TYPES;
    description: string;
  }> {
    return Object.fromEntries(
      Object.entries(definitions).map(([key, config]) => {
        return [key, {
          defaultValue: config.defaultValue,
          description: config.description,
        }];
      }),
    );
  }

  public static getBoolean(
    key: string,
    defaultValue = false,
  ): boolean {
    const value = ENV.getEnv(key);
    if (value == null || value === "") return defaultValue;
    return ["true", "t", "1", "yes", "y"].includes(value.toLowerCase());
  }

  public static getNumber(
    key: string,
    defaultValue = 0,
  ): number {
    const value = ENV.getEnv(key);
    if (value == null || value === "") return defaultValue;
    return parseInt(value, 10);
  }

  public static getString(
    key: string,
    defaultValue = "",
  ): string {
    const value = ENV.getEnv(key);
    return value ?? defaultValue;
  }

  private static getEnv(
    key: string,
  ): string | undefined {
    return getEnv(key);
  }
}
