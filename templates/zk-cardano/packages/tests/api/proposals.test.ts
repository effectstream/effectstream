import { assert } from "../helpers.ts";

const API = "http://localhost:9999";

export async function proposalsApiTest() {
  await assert("GET /api/proposals returns 200 with array", async () => {
    const r = await fetch(`${API}/api/proposals`);
    if (!r.ok) return false;
    const data = await r.json();
    return Array.isArray(data);
  });
}
