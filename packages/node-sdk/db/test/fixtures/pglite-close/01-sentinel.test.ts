import { expect, test } from "bun:test";

if (process.env.EFFECTSTREAM_PGLITE_MULTIFILE_FIXTURE !== "1") {
  test.skip("multi-file sentinel fixture runs only through its parent", () => {});
} else {
  console.info("PGLITE_SENTINEL_REGISTERED");
  test("the following file still registers", () => {
    expect(true).toBe(true);
  });
}
