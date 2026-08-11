import { assert } from "../helpers.ts";

export async function syncReadyTest() {
  await assert("Sync node API responds", async () => {
    const res = await fetch("http://localhost:9999/block-heights");
    return res.ok;
  });

  await assert("Block heights are advancing", async () => {
    // Compare PER PROTOCOL, not Math.max() across all of them. The max is owned
    // by whichever protocol has the highest page number, and a protocol that has
    // caught up sits there unchanged — masking every protocol that is still
    // advancing beneath it. Observed on a failing run: parallelUtxoRpc pinned at
    // page 43 while mainNtp climbed 2 -> 35 over 30s, so max() stayed 43 and the
    // assertion reported "not advancing" while sync was demonstrably alive.
    // mainNtp needed ~41s to cross 43 — just past this poll window, which is why
    // the old check failed on some machines and passed on others.
    const byProtocol = (data: any[]): Map<string, number> =>
      new Map(data.map((d: any) => [d.protocol_name, d.fetched_page ?? 0]));

    for (let attempt = 0; attempt < 10; attempt++) {
      const before = byProtocol(
        (await (await fetch("http://localhost:9999/block-heights")).json()) as any[],
      );
      await new Promise((r) => setTimeout(r, 3000));
      const after = byProtocol(
        (await (await fetch("http://localhost:9999/block-heights")).json()) as any[],
      );
      // Sync is alive if ANY protocol made progress.
      for (const [protocol, page] of after) {
        const previous = before.get(protocol);
        if (previous !== undefined && page > previous) return true;
      }
    }
    return false;
  });
}
