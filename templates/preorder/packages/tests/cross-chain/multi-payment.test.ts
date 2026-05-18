import { assert } from "../helpers.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const BASE_URL = `http://localhost:${API_PORT}`;

export async function multiPaymentTest() {
  // After Phase B, we have both EVM purchases and Cardano payments recorded
  // Verify the API returns data from both chains

  await assert("Launchpad detail reflects EVM purchases", async () => {
    const res = await fetch(`${BASE_URL}/api/launchpad/test-launchpad-1`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    // At least one item should have purchased > 0 from the EVM tests
    return data.items.some((item: any) => item.purchased > 0);
  });

  await assert("Cardano payments endpoint has records", async () => {
    const res = await fetch(`${BASE_URL}/api/cardano-payments/test-launchpad-1`);
    if (!res.ok) return false;
    const data = await res.json() as any;
    return Array.isArray(data.payments) && data.payments.length > 0;
  });
}
