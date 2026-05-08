import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const BASE_URL = `http://localhost:${API_PORT}`;

export async function launchpadsApiTest() {
  await assert("GET /api/launchpads returns launchpad list", async () => {
    const res = await fetch(`${BASE_URL}/api/launchpads`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return Array.isArray(data.launchpads) && data.launchpads.length > 0;
  });

  await assert("GET /api/launchpad/test-launchpad-1 returns detail", async () => {
    const res = await fetch(`${BASE_URL}/api/launchpad/test-launchpad-1`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return data.slug === "test-launchpad-1" && Array.isArray(data.items);
  });

  await assert("GET /api/launchpad/nonexistent returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/launchpad/nonexistent`);
    return res.status === 404;
  });
}
