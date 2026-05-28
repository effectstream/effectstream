import { assert } from "../helpers.ts";
import { TEST_PAYLOAD } from "./submit-input.test.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/inputs returns the previously submitted payload", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/inputs`);
    const data = await res.json();
    return (
      Array.isArray(data.inputs) &&
      data.inputs.some((r: any) => r.payload === TEST_PAYLOAD)
    );
  });
}
