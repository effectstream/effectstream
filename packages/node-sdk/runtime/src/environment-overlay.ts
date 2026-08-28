export const RUN_EFFECTSTREAM_ENV_KEYS = Object.freeze([
  "PGLITE",
  "PGLITE_DATA_DIR",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_NAME",
  "DB_PW",
  "MQTT_BROKER",
] as const);

export type RunEffectstreamEnvKey =
  (typeof RUN_EFFECTSTREAM_ENV_KEYS)[number];

export type RunEffectstreamEnvSnapshot = Readonly<
  Record<RunEffectstreamEnvKey, {
    present: boolean;
    value: string | undefined;
  }>
>;

/** Capture exact property presence as well as value for the owned keys. */
export function snapshotRunEffectstreamEnvironment(): RunEffectstreamEnvSnapshot {
  return Object.fromEntries(
    RUN_EFFECTSTREAM_ENV_KEYS.map((key) => [key, {
      present: Object.prototype.hasOwnProperty.call(process.env, key),
      value: process.env[key],
    }]),
  ) as RunEffectstreamEnvSnapshot;
}

export function overlayRunEffectstreamEnvironment(
  values: Partial<Record<RunEffectstreamEnvKey, string | undefined>>,
): void {
  for (const [key, value] of Object.entries(values) as Array<
    [RunEffectstreamEnvKey, string | undefined]
  >) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Restore all owned keys even if restoring an earlier key unexpectedly fails. */
export function restoreRunEffectstreamEnvironment(
  snapshot: RunEffectstreamEnvSnapshot,
): void {
  const failures: unknown[] = [];
  for (const key of RUN_EFFECTSTREAM_ENV_KEYS) {
    try {
      const original = snapshot[key];
      if (original.present) process.env[key] = original.value ?? "";
      else delete process.env[key];
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Failed to restore the runEffectstream environment",
    );
  }
}
