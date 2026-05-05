import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

export async function apiTest() {
  await assert("GET /api/open_lobbies returns lobbies array", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/open_lobbies?wallet=0x0000000000000000000000000000000000000000&count=10&page=0`,
    );
    const data = await res.json();
    return Array.isArray(data.lobbies);
  });

  await assert("GET /api/random_lobby returns response", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/random_lobby`);
    const data = await res.json();
    return "lobby" in data;
  });

  await assert("GET /api/user_stats returns response for unknown wallet", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/user_stats?wallet=0x0000000000000000000000000000000000000000`,
    );
    const data = await res.json();
    return "stats" in data;
  });
}
