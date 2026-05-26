import { test, expect } from "@playwright/test";

test("dashboard loads with pool info", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
  await expect(page.getByTestId("pool-info")).toBeVisible();
  await expect(page.getByTestId("pool-hash").first()).toContainText("730176");
});

test("create wallet shows address", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-address").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("wallet-balance").first()).toContainText("0 ADA");
});

test("fund wallet updates balance", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-address").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("fund-wallet-btn").first().click();
  await expect(page.getByTestId("wallet-balance").first()).not.toHaveText(
    "0 ADA",
    { timeout: 60_000 },
  );
});

test("delegate wallet - delegation appears in table", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-address").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("fund-wallet-btn").first().click();
  await expect(page.getByTestId("wallet-balance").first()).not.toHaveText(
    "0 ADA",
    { timeout: 60_000 },
  );
  await page.getByTestId("delegate-btn").first().click();
  await expect(
    page.getByTestId("delegation-status").first(),
  ).toContainText("Delegated", { timeout: 60_000 });
  await expect(page.getByTestId("delegation-row").first()).toBeVisible({
    timeout: 60_000,
  });
});

test("re-delegate to different pool", async ({ page }) => {
  await page.goto("/");

  // Create, fund, and delegate to genesis pool
  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-address").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("fund-wallet-btn").first().click();
  await expect(page.getByTestId("wallet-balance").first()).not.toHaveText(
    "0 ADA",
    { timeout: 60_000 },
  );
  await page.getByTestId("delegate-btn").first().click();
  await expect(
    page.getByTestId("delegation-status").first(),
  ).toContainText("Delegated", { timeout: 60_000 });

  // Button should say "Re-delegate" and be enabled
  await expect(page.getByTestId("delegate-btn").first()).toHaveText("Re-delegate");
  await expect(page.getByTestId("delegate-btn").first()).toBeEnabled();

  // Count delegations before re-delegation
  const countBefore = await page.getByTestId("delegation-row").count();

  // Switch to Test Pool 2
  await page.getByTestId("pool-select").first().selectOption({ index: 1 });

  // Re-delegate
  await page.getByTestId("delegate-btn").first().click();

  // Wait for re-delegation to complete (button returns to "Re-delegate" from "Delegating...")
  await expect(page.getByTestId("delegate-btn").first()).not.toHaveText(
    "Delegating...",
    { timeout: 60_000 },
  );

  // A new delegation row should appear
  await expect(async () => {
    const countAfter = await page.getByTestId("delegation-row").count();
    expect(countAfter).toBeGreaterThan(countBefore);
  }).toPass({ timeout: 60_000 });
});

test("create and delegate multiple wallets", async ({ page }) => {
  await page.goto("/");

  // Count existing delegation rows (from previous tests)
  const initialCount = await page.getByTestId("delegation-row").count();

  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-card").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("fund-wallet-btn").first().click();
  await expect(page.getByTestId("wallet-balance").first()).not.toHaveText(
    "0 ADA",
    { timeout: 60_000 },
  );
  await page.getByTestId("delegate-btn").first().click();
  await expect(
    page.getByTestId("delegation-status").first(),
  ).toContainText("Delegated", { timeout: 60_000 });

  await page.getByTestId("create-wallet-btn").click();
  await expect(page.getByTestId("wallet-card")).toHaveCount(2, {
    timeout: 30_000,
  });
  await page.getByTestId("fund-wallet-btn").nth(1).click();
  await expect(page.getByTestId("wallet-balance").nth(1)).not.toHaveText(
    "0 ADA",
    { timeout: 60_000 },
  );
  await page.getByTestId("delegate-btn").nth(1).click();
  await expect(
    page.getByTestId("delegation-status").nth(1),
  ).toContainText("Delegated", { timeout: 60_000 });

  // At least 2 new delegation rows should appear
  await expect(async () => {
    const count = await page.getByTestId("delegation-row").count();
    expect(count).toBeGreaterThanOrEqual(initialCount + 2);
  }).toPass({ timeout: 60_000 });
});

test("chain is syncing blocks", async ({ request }) => {
  const res = await request.get("http://localhost:9999/api/block-heights");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.length).toBeGreaterThan(0);
  expect(Number(data[0].synced_page)).toBeGreaterThan(0);
});

test("dev info panel shows service ports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dev-info")).toBeVisible();
  await expect(page.getByTestId("dev-info")).toContainText("50051");
  await expect(page.getByTestId("dev-info")).toContainText("10000");
});

test("API /api/delegations returns data", async ({ request }) => {
  const res = await request.get(
    "http://localhost:9999/api/delegations?limit=10&offset=0",
  );
  expect(res.ok()).toBeTruthy();
});

test("API /api/pool-stats returns pool data", async ({ request }) => {
  const res = await request.get("http://localhost:9999/api/pool-stats");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.length).toBeGreaterThan(0);
  const pools = data.map((d: any) => d.pool);
  expect(pools).toContain(
    "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
  );
});
