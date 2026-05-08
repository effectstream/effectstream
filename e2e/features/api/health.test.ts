import { assert } from "@e2e/engine";

export async function healthTest(apiPort: number) {
  await assert("Health endpoint returns ok", async () => {
    const response = await fetch(`http://localhost:${apiPort}/health`);
    const data = await response.json();
    return data.status === "ok";
  });
}
