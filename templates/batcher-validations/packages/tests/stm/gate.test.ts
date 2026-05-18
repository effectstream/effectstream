import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function gateTest() {
  await assert("GET /api/gate returns accepting=true by default", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/gate`);
    const data = await res.json();
    return data.accepting === true;
  });

  await assert("POST /api/gate toggles to false", async () => {
    await fetch(`http://localhost:${API_PORT}/api/gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepting: false }),
    });
    const res = await fetch(`http://localhost:${API_PORT}/api/gate`);
    const data = await res.json();
    return data.accepting === false;
  });

  await assert("POST /api/gate toggles back to true", async () => {
    await fetch(`http://localhost:${API_PORT}/api/gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepting: true }),
    });
    const res = await fetch(`http://localhost:${API_PORT}/api/gate`);
    const data = await res.json();
    return data.accepting === true;
  });
}
