import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/game/tokens returns world token pool", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/game/tokens?wallet=0x0000000000000000000000000000000000000000`,
    );
    const data = await res.json();
    return data.stats != null && typeof data.stats.global === "number" && data.stats.global > 0;
  });
}
