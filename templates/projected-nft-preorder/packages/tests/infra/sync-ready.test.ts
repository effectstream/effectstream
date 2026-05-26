import { assert } from "../helpers.ts";

export async function syncReadyTest(): Promise<void> {
  await assert("Sync node health endpoint is OK", async () => {
    const res = await fetch("http://localhost:9999/health");
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok";
  });
}
