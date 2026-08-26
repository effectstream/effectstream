import { afterAll, expect, test } from "bun:test";
import { Client } from "pg";
import { startPglite } from "../../../scripts/start-pglite.ts";

const enabled = process.env.EFFECTSTREAM_PGLITE_MULTIFILE_FIXTURE === "1";

if (!enabled) {
  test.skip("multi-file retained-client fixture runs only through its parent", () => {});
} else {
  const handle = await startPglite(0);
  const client = new Client({
    host: "127.0.0.1",
    port: handle.port,
    user: "postgres",
    database: "postgres",
  });

  test("leaves a raw client connected during default close", async () => {
    await client.connect();
    expect((await client.query("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  });

  afterAll(async () => {
    await handle.close();
    console.info("PGLITE_LIVE_CLIENT_CLOSED_DEFAULT");
  });
}
