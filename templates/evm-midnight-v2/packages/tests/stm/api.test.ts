import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

export async function apiTest() {
  await assert("GET /api/erc721 returns array", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
    const data = await res.json();
    return Array.isArray(data);
  });
}
