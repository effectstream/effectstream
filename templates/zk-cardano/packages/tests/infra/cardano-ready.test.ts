import { assert } from "../helpers.ts";

export async function cardanoReadyTest() {
  await assert("YACI DevKit admin API responds", async () => {
    const res = await fetch("http://localhost:10000/local-cluster/api/admin/devnet");
    return res.ok;
  });

  await assert("Dolos MiniBF blockfrost API responds", async () => {
    const res = await fetch("http://localhost:3000/blocks/latest");
    if (!res.ok) return false;
    const block = await res.json();
    return typeof block.time === "number";
  });
}
