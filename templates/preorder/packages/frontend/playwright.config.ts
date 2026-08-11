import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  use: {
    // 127.0.0.1, not localhost: the dev server is started with
    // `--host 127.0.0.1` (see packages/tests/frontend/e2e.test.ts) because
    // "localhost" resolves to ::1 in the CI container. Keep these in lockstep.
    baseURL: "http://127.0.0.1:10598",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", headless: true },
    },
  ],
});
