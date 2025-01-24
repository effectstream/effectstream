/**
 * Careful: this class uses `process.env`
 * which might not be set depending on the framework used for the frontend of an app
 */
export class ENV {
  static doHealthCheck(): void {}

  // Security
  static get RECAPTCHA_V3_FRONTEND(): undefined | string {
    return Deno.env.get("RECAPTCHA_V3_FRONTEND");
  }

  // Game node config:
  static get STORE_HISTORICAL_GAME_INPUTS(): boolean {
    return ENV.isTrue(Deno.env.get("STORE_HISTORICAL_GAME_INPUTS"), true);
  }

  // MQTT BROKER
  static get MQTT_BROKER(): boolean {
    return ENV.isTrue(Deno.env.get("MQTT_BROKER"), true);
  }
  static get MQTT_ENGINE_BROKER_PORT(): number {
    return parseInt(Deno.env.get("MQTT_BROKER_PORT") || "8883", 10);
  }
  static get MQTT_BATCHER_BROKER_PORT(): number {
    return parseInt(Deno.env.get("MQTT_BROKER_PORT") || "8884", 10);
  }
  // MQTT CLIENT
  static get MQTT_ENGINE_BROKER_URL(): string {
    return Deno.env.get("MQTT_ENGINE_BROKER_URL") ||
      "ws://127.0.0.1:" + ENV.MQTT_ENGINE_BROKER_PORT;
  }
  static get MQTT_BATCHER_BROKER_URL(): string {
    return Deno.env.get("MQTT_BATCHER_BROKER_URL") ||
      "ws://127.0.0.1:" + ENV.MQTT_BATCHER_BROKER_PORT;
  }

  // Utils
  private static isTrue(
    value: string | undefined,
    defaultValue = false,
  ): boolean {
    if (value == null || value === "") return defaultValue;
    return ["true", "1", "yes"].includes(value.toLowerCase());
  }
}
