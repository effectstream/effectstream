import { assert } from "../helpers.ts";

export async function syncReadyTest() {
  await assert("Sync node API responds", async () => {
    const res = await fetch("http://localhost:9999/block-heights");
    return res.ok;
  });

  await assert("Block heights are advancing", async () => {
    const getMaxHeight = (data: any[]): number => {
      const pages = data.map((d: any) => d.fetched_page ?? 0);
      return pages.length > 0 ? Math.max(...pages) : 0;
    };
    for (let attempt = 0; attempt < 10; attempt++) {
      const res1 = await fetch("http://localhost:9999/block-heights");
      const data1 = await res1.json() as any[];
      await new Promise((r) => setTimeout(r, 3000));
      const res2 = await fetch("http://localhost:9999/block-heights");
      const data2 = await res2.json() as any[];
      if (data2.length > 0 && getMaxHeight(data2) > getMaxHeight(data1)) {
        return true;
      }
    }
    return false;
  });
}
