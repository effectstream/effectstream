import { assert } from "../helpers.ts";

export async function cardanoReadyTest() {
  await assert("YACI DevKit responds on port 10000", async () => {
    const res = await fetch("http://localhost:10000/local-cluster/api/admin/devnet");
    return res.ok;
  });

  await assert("Dolos Blockfrost responds on port 3000", async () => {
    const res = await fetch("http://localhost:3000/blocks/latest");
    return res.ok;
  });
}
