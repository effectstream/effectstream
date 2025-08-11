/**
 * Careful: this class uses `process.env`
 * which might not be set depending on the framework used for the frontend of an app
 */

// TODO: To register a new config, we need to add it in the defintions, and then add the getter in the ENV class.
//       Is it possible to do this automatically, or just once?
import process from "node:process";
const definitions = {
  DB_HOST: {
    key: "DB_HOST",
    isSecret: false,
    type: "string",
    defaultValue: "localhost",
    description: "Paima Engine Postgres Host URL. Example: 'localhost'",
  },
  DB_NAME: {
    key: "DB_NAME",
    isSecret: false,
    type: "string",
    defaultValue: "postgres",
    description: "Paima Engine Postgres Database Name. Example: 'postgres'",
  },
  DB_PORT: {
    key: "DB_PORT",
    isSecret: false,
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
    isSecret: false,
    type: "string",
    defaultValue: "postgres",
    description: "Paima Engine Postgres User. Example: 'postgres'",
  },
  NODE_ENV: {
    key: "NODE_ENV",
    isSecret: false,
    type: "string",
    defaultValue: undefined,
    description: "Node Environment. Example: 'development' or 'production'",
  },
  ORCHESTRATOR_URL: {
    key: "ORCHESTRATOR_URL",
    isSecret: false,
    type: "string",
    defaultValue: "http://localhost",
    description: "Paima Engine Orchestrator URL. Example: 'http://localhost'",
  },
  ORCHESTRATOR_PORT: {
    key: "ORCHESTRATOR_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 3000,
    description:
      "Paima Engine Orchestrator Port. Used by the TUI to monitor processes. Example: '3000'",
  },
  TUI_LOG_URL: {
    key: "TUI_LOG_URL",
    isSecret: false,
    type: "string",
    defaultValue: "http://localhost",
    description: "TUI Log URL. Example: 'http://localhost'",
  },
  TUI_LOG_PORT: {
    key: "TUI_LOG_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 11033,
    description: "TUI Log Port. Example: '11033'",
  },
  SHELL: {
    isSystem: true,
    key: "SHELL",
    isSecret: false,
    type: "string",
    defaultValue: undefined,
    description:
      "System shell path. This is set by the OS. Used to run TUI/tmux commands",
  },
  TMUX: {
    isSystem: true,
    key: "TMUX",
    isSecret: false,
    type: "string",
    defaultValue: undefined,
    description:
      "System tmux path. This is set by Tmux itself. Used to check if the process is running in a tmux session",
  },
  RECAPTCHA_V3_FRONTEND: {
    key: "RECAPTCHA_V3_FRONTEND",
    isSecret: false,
    type: "string",
    defaultValue: undefined,
    description:
      "ReCaptcha V3 Frontend Key. Used by the Batcher to verify requests. Leave empty to disable. Example: '6Lc123456789012345678901234567890'",
  },
  BATCHER_PORT: {
    key: "BATCHER_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 3334,
    description: "Batcher Port. Example: '3334'",
  },
  STORE_HISTORICAL_GAME_INPUTS: {
    key: "STORE_HISTORICAL_GAME_INPUTS",
    isSecret: false,
    type: "boolean",
    defaultValue: true,
    description: "Store Historical Game Inputs. Example: 'true' or 'false'",
  },
  MQTT_BROKER: {
    key: "MQTT_BROKER",
    isSecret: false,
    type: "boolean",
    defaultValue: true,
    description: "MQTT Broker. Example: 'true' or 'false'",
  },
  MQTT_ENGINE_BROKER_URL: {
    key: "MQTT_ENGINE_BROKER_URL",
    isSecret: false,
    type: "string",
    defaultValue: "ws://127.0.0.1:8883",
    description: "MQTT Engine Broker URL. Example: 'ws://127.0.0.1:8883'",
  },
  MQTT_ENGINE_BROKER_PORT: {
    key: "MQTT_ENGINE_BROKER_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 8883,
    description: "MQTT Engine Broker Port. Example: '8883'",
  },
  MQTT_BATCHER_BROKER_URL: {
    key: "MQTT_BATCHER_BROKER_URL",
    isSecret: false,
    type: "string",
    defaultValue: "ws://127.0.0.1:8884",
    description: "MQTT Batcher Broker URL. Example: 'ws://127.0.0.1:8884'",
  },
  MQTT_BATCHER_BROKER_PORT: {
    key: "MQTT_BATCHER_BROKER_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 8884,
    description: "MQTT Batcher Broker Port. Example: '8884'",
  },
  PAIMA_API_PORT: {
    key: "PAIMA_API_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 9999,
    description:
      "Main Paima API Port. Used by developers custom endpoints and RPC endpoints. Example: '9999'",
  },
  PAIMA_EXPLORER_PORT: {
    key: "PAIMA_EXPLORER_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 10599,
    description: "Explorer Port. Example: '10599'",
  },
  PAIMA_CHAIN_ID: {
    key: "PAIMA_CHAIN_ID",
    isSecret: false,
    type: "number",
    defaultValue: 87401284021,
    description: "Paima Chain ID. Example: '87401284021'",
  },
  PGLITE: {
    key: "PGLITE",
    isSecret: false,
    type: "boolean",
    defaultValue: true,
    description:
      "Enable single connection mode and other specific PGLite features. IMPORTANT enable only for development. ('true' or 'false')",
  },
  DEBUG_PGLITE: {
    key: "DEBUG_PGLITE",
    isSecret: false,
    type: "number",
    defaultValue: undefined,
    description: "Enable PGLite Debug/Verbose mode. Example: '1'",
  },
  OTEL_COLLECTOR_PORT: {
    key: "OTEL_COLLECTOR_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 4318,
    description: "OTEL Collector Port. Example: '4318'",
  },
  DOCS_PORT: {
    key: "DOCS_PORT",
    isSecret: false,
    type: "number",
    defaultValue: 10600,
    description: "Docs Port. Example: '10600'",
  },
} as const;

type ENV_TYPES = string | number | boolean | undefined;

export class ENV {
  static get MQTT_BROKER(): boolean {
    return ENV.getConfig(definitions.MQTT_BROKER);
  }
  static get MQTT_ENGINE_BROKER_PORT(): number {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_PORT);
  }
  static get MQTT_BATCHER_BROKER_PORT(): number {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_PORT);
  }
  static get MQTT_ENGINE_BROKER_URL(): string {
    return ENV.getConfig(definitions.MQTT_ENGINE_BROKER_URL);
  }
  static get MQTT_BATCHER_BROKER_URL(): string {
    return ENV.getConfig(definitions.MQTT_BATCHER_BROKER_URL);
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
  static get PAIMA_API_PORT(): number {
    return ENV.getConfig(definitions.PAIMA_API_PORT);
  }
  static get RECAPTCHA_V3_FRONTEND(): string {
    return ENV.getConfig(definitions.RECAPTCHA_V3_FRONTEND);
  }
  static get BATCHER_PORT(): number {
    return ENV.getConfig(definitions.BATCHER_PORT);
  }
  static get PAIMA_EXPLORER_PORT(): number {
    return ENV.getConfig(definitions.PAIMA_EXPLORER_PORT);
  }
  static get PAIMA_CHAIN_ID(): number {
    return ENV.getConfig(definitions.PAIMA_CHAIN_ID);
  }
  static get PGLITE(): boolean {
    return ENV.getConfig(definitions.PGLITE);
  }
  static get DEBUG_PGLITE(): number {
    return ENV.getConfig(definitions.DEBUG_PGLITE);
  }
  static get OTEL_COLLECTOR_PORT(): number {
    return ENV.getConfig(definitions.OTEL_COLLECTOR_PORT);
  }
  static get DOCS_PORT(): number {
    return ENV.getConfig(definitions.DOCS_PORT);
  }
  static getConfig<T>(config: typeof definitions[keyof typeof definitions]): T {
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

  private static getBoolean(
    key: string,
    defaultValue = false,
  ): boolean {
    const value = ENV.getEnv(key);
    if (value == null || value === "") return defaultValue;
    return ["true", "1", "yes"].includes(value.toLowerCase());
  }

  private static getNumber(
    key: string,
    defaultValue = 0,
  ): number {
    const value = ENV.getEnv(key);
    if (value == null || value === "") return defaultValue;
    return parseInt(value, 10);
  }

  private static getString(
    key: string,
    defaultValue = "",
  ): string {
    const value = ENV.getEnv(key);
    return value ?? defaultValue;
  }

  private static getEnv(
    key: string,
  ): string | undefined {
    try {
      return Deno.env.get(key);
    } catch (error) {
      return process.env[key];
    }
  }
}
