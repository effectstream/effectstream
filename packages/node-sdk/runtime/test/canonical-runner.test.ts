import { expect, test } from "bun:test";

const ABSENT = null;
const pgliteDefaults = {
  PGLITE: "true",
  PGLITE_DATA_DIR: "memory://",
  DB_HOST: "127.0.0.1",
  DB_PORT: "41337",
  DB_USER: "postgres",
  DB_NAME: "postgres",
  DB_PW: ABSENT,
  MQTT_BROKER: "false",
} as const;

const cases = [
  {
    name: "omitted PGlite uses all general defaults and fallback namespace",
    input: { expected: pgliteDefaults },
  },
  {
    name: "explicit PGlite preserves original nonempty directory user and database while ignoring ambient host port and password",
    input: {
      ambient: {
        PGLITE: "false",
        PGLITE_DATA_DIR: "idb://ambient",
        DB_HOST: "ambient-host",
        DB_PORT: "19999",
        DB_USER: "ambient-user",
        DB_NAME: "ambient-db",
        DB_PW: "ambient-password",
        MQTT_BROKER: "true",
      },
      database: { type: "pglite", port: 12_345 },
      namespace: "string",
      actualPort: 12_345,
      expectedStartPort: 12_345,
      expected: {
        PGLITE: "true",
        PGLITE_DATA_DIR: "idb://ambient",
        DB_HOST: "127.0.0.1",
        DB_PORT: "12345",
        DB_USER: "ambient-user",
        DB_NAME: "ambient-db",
        DB_PW: ABSENT,
        MQTT_BROKER: "false",
      },
    },
  },
  {
    name: "explicit empty PGlite directory and empty ambient user/database choose the reviewed values",
    input: {
      ambient: { PGLITE_DATA_DIR: "ambient", DB_USER: "", DB_NAME: "" },
      database: { type: "pglite", dataDir: "" },
      namespace: "historical",
      expected: { ...pgliteDefaults, PGLITE_DATA_DIR: "" },
    },
  },
  {
    name: "PGlite messaging true overrides conflicting ambient broker and enables events",
    input: {
      ambient: { MQTT_BROKER: "false" },
      messaging: true,
      actualPort: 45_678,
      expected: { ...pgliteDefaults, DB_PORT: "45678", MQTT_BROKER: "true" },
    },
  },
  {
    name: "explicit PGlite messaging false overrides conflicting ambient broker",
    input: {
      ambient: { MQTT_BROKER: "true" },
      messaging: false,
      expected: pgliteDefaults,
    },
  },
  {
    name: "an absent API environment remains absent and retains the existing 9999 fallback",
    input: { apiPort: "absent", expected: pgliteDefaults },
  },
  {
    name: "PostgreSQL required fields and absent password override every ambient DB value",
    input: {
      ambient: {
        PGLITE: "true",
        PGLITE_DATA_DIR: "ambient-dir",
        DB_HOST: "ambient-host",
        DB_PORT: "10001",
        DB_USER: "ambient-user",
        DB_NAME: "ambient-db",
        DB_PW: "ambient-password",
        MQTT_BROKER: "true",
      },
      database: {
        type: "postgres",
        host: "db.internal",
        port: 15_432,
        user: "runner",
        database: "runner-db",
      },
      expected: {
        PGLITE: "false",
        PGLITE_DATA_DIR: ABSENT,
        DB_HOST: "db.internal",
        DB_PORT: "15432",
        DB_USER: "runner",
        DB_NAME: "runner-db",
        DB_PW: ABSENT,
        MQTT_BROKER: "false",
      },
    },
  },
  {
    name: "PostgreSQL present password and messaging true win over ambient values",
    input: {
      ambient: { DB_PW: "ambient-password", MQTT_BROKER: "false" },
      database: {
        type: "postgres",
        host: "db.internal",
        port: 15_433,
        user: "runner",
        database: "runner-db",
        password: "option-password",
      },
      messaging: true,
      expected: {
        PGLITE: "false",
        PGLITE_DATA_DIR: ABSENT,
        DB_HOST: "db.internal",
        DB_PORT: "15433",
        DB_USER: "runner",
        DB_NAME: "runner-db",
        DB_PW: "option-password",
        MQTT_BROKER: "true",
      },
    },
  },
  {
    name: "PostgreSQL explicit empty password stays present and empty",
    input: {
      ambient: { DB_PW: "ambient-password" },
      database: {
        type: "postgres",
        host: "db.internal",
        port: 15_434,
        user: "runner",
        database: "runner-db",
        password: "",
      },
      expected: {
        PGLITE: "false",
        PGLITE_DATA_DIR: ABSENT,
        DB_HOST: "db.internal",
        DB_PORT: "15434",
        DB_USER: "runner",
        DB_NAME: "runner-db",
        DB_PW: "",
        MQTT_BROKER: "false",
      },
    },
  },
  ...([
    "startup-failure",
    "runtime-failure",
    "cancel",
    "acquisition-failure",
    "pglite-cleanup-failure",
    "pool-pglite-cleanup-failure",
  ] as const).map((outcome) => ({
    name: `${outcome} restores the exact environment and aggregates cleanup`,
    input: { outcome, expected: pgliteDefaults },
  })),
];

async function runCase(...args: string[]): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "packages/node-sdk/runtime/test/canonical-runner-case.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, `${args[0]}\n${stdout}\n${stderr}`).toBe(0);
  expect(stdout).toContain("ok");
}

test.each(cases)("$name", ({ input }) =>
  runCase("matrix", JSON.stringify(input)));

test("invalid legacy shape does not claim the one-shot runner", () =>
  runCase("invalid-does-not-claim"));

test("owned real PGlite uses and releases a validated random port above 10000", () =>
  runCase("real-pglite"), 30_000);

test("omitted database starts real PGlite on its returned ephemeral port and releases it", () =>
  runCase("real-pglite-ephemeral"), 30_000);

test.skipIf(process.env.EFFECTSTREAM_TEST_PG_PORT === undefined)(
  "external PostgreSQL 16 uses the explicit object and starts no PGlite server",
  () => runCase("real-postgres"),
  30_000,
);

test("the canonical block path directly calls the passed StateMachine without an adapter", async () => {
  const source = await Bun.file(
    "packages/node-sdk/runtime/src/process-blocks.ts",
  ).text();
  expect(source).toContain("stateMachine.processInput(input)");
  expect(source).not.toContain("gameStateTransitions = stateMachine");
  expect(source).not.toContain("stateMachineAdapter");
});
