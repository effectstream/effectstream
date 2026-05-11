import { assert } from "../helpers.ts";

export async function apiTest(): Promise<void> {
  await assert("API: /api/locks returns array", async () => {
    const res = await fetch("http://localhost:9999/api/locks");
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data);
  });

  await assert("API: /api/campaigns returns array", async () => {
    const res = await fetch("http://localhost:9999/api/campaigns");
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data);
  });

  await assert("API: /api/marketplace returns array", async () => {
    const res = await fetch("http://localhost:9999/api/marketplace");
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data);
  });

  await assert("API: /api/cardano/script-hash returns hash", async () => {
    const res = await fetch("http://localhost:9999/api/cardano/script-hash");
    if (!res.ok) return false;
    const data = await res.json();
    return typeof data.scriptHash === "string" && data.scriptHash.length > 0;
  });
}
