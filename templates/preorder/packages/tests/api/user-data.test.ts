import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const BASE_URL = `http://localhost:${API_PORT}`;

// Account 0 made purchases in Phase B
const TEST_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();

export async function userDataApiTest() {
  await assert("GET /api/userData returns user + items", async () => {
    const res = await fetch(`${BASE_URL}/api/userData/test-launchpad-1?wallet=${TEST_WALLET}`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return data.user !== null && Array.isArray(data.items);
  });

  await assert("GET /api/participations returns history", async () => {
    const res = await fetch(`${BASE_URL}/api/participations/test-launchpad-1?wallet=${TEST_WALLET}`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return Array.isArray(data.participations) && data.participations.length > 0;
  });

  await assert("GET /api/userData without wallet returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/userData/test-launchpad-1`);
    return res.status === 400;
  });
}
