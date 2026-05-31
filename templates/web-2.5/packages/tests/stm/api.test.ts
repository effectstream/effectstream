import { assert } from "../helpers.ts";
import { wallet0, TEST_NAME } from "./actions.test.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/users returns a non-empty array", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/users`);
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  });

  await assert("GET /api/user?wallet= reflects the direct submitter's name", async () => {
    const res = await fetch(
      `http://localhost:${API_PORT}/api/user?wallet=${wallet0.address.toLowerCase()}`,
    );
    const data = await res.json();
    return data.user != null && data.user.name === TEST_NAME;
  });
}
