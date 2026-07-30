import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function apiTest(userAddr: string, expectedValue: number) {
  await assert("GET /api/counters returns the row", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/counters`);
    const data = await res.json();
    return (
      Array.isArray(data.counters) &&
      data.counters.some((c: any) => c.authority === userAddr)
    );
  });

  await assert(`GET /api/counter/${userAddr} returns the expected value`, async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/counter/${userAddr}`);
    if (!res.ok) return false;
    const data = await res.json();
    return Number(data.counter?.value) === expectedValue;
  });

  await assert("GET /api/counter-events returns the most recent event", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/counter-events?limit=10`,
    );
    const data = await res.json();
    return Array.isArray(data.events) && data.events.length > 0;
  });
}
