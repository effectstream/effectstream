import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/commands returns array with data", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/commands`);
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  });
}
