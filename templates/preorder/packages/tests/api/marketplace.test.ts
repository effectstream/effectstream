import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const BASE_URL = `http://localhost:${API_PORT}`;

const TEST_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();

export async function marketplaceApiTest() {
  await assert("GET /api/marketplace/items returns item metadata", async () => {
    const res = await fetch(`${BASE_URL}/api/marketplace/items/test-launchpad-1`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return (
      data.launchpad === "test-launchpad-1" &&
      Array.isArray(data.items) &&
      data.items.length > 0 &&
      data.items[0].id !== undefined &&
      data.items[0].name !== undefined
    );
  });

  await assert("GET /api/marketplace/ownership returns user items", async () => {
    const res = await fetch(`${BASE_URL}/api/marketplace/ownership/test-launchpad-1?wallet=${TEST_WALLET}`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return data.wallet === TEST_WALLET && Array.isArray(data.items);
  });
}
