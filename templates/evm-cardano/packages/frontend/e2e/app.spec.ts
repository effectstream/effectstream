import { test, expect } from "@playwright/test";

test("dashboard loads with title and chain status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
  await expect(page.getByTestId("chain-status-evm")).toBeVisible();
  await expect(page.getByTestId("chain-status-cardano")).toBeVisible();
});

test("connect EVM wallet shows address", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("connect-evm-btn")).toBeVisible();
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("connect-evm-btn")).not.toBeVisible();
});

test("connect Cardano wallet shows address", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("connect-cardano-btn")).toBeVisible();
  await page.getByTestId("connect-cardano-btn").click();
  await expect(page.getByTestId("cardano-address")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("connect-cardano-btn")).not.toBeVisible();
});

test("mint NFT: connect EVM wallet, mint, event appears in feed", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("mint-nft-btn").click();
  await expect(page.getByText("NFT minted!")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="event-item"]').filter({ hasText: "NFT" }).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("faucet: connect Cardano wallet, request ADA from faucet", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("connect-cardano-btn").click();
  await expect(page.getByTestId("cardano-address")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("faucet-btn")).toBeVisible();
  await page.getByTestId("faucet-btn").click();
  await expect(page.getByText(/Faucet:.*ADA received!/)).toBeVisible({ timeout: 60_000 });
});

test("send ADA: connect Cardano wallet, faucet, open modal, send real transaction", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("connect-cardano-btn").click();
  await expect(page.getByTestId("cardano-address")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("faucet-btn").click();
  await expect(page.getByText(/Faucet:.*ADA received!/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5000);
  await page.getByTestId("send-ada-btn").click();
  await expect(page.getByTestId("send-ada-modal")).toBeVisible();
  await page.getByTestId("send-ada-confirm-btn").click();
  await expect(page.getByText("100 ADA sent!")).toBeVisible({ timeout: 60_000 });
});

test("chain stats show non-zero block heights", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("evm-block-height")).not.toHaveText("0", { timeout: 15_000 });
  await expect(page.getByTestId("l2-block-height")).not.toHaveText("0", { timeout: 15_000 });
  await expect(page.getByTestId("chain-status-l2")).toContainText("L2 Main Chain");
});

test("event feed hidden until wallet connected, then shows events", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Connect a wallet to see events")).toBeVisible();
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("event-item").first()).toBeVisible({ timeout: 15_000 });
});

test("dev info panel shows service ports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dev-info")).toBeVisible();
  await expect(page.getByTestId("dev-info")).toContainText("8545");
  await expect(page.getByTestId("dev-info")).toContainText("50051");
});

test("events table visible and populates after action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Events Table")).toBeVisible();
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("mint-nft-btn").click();
  await expect(page.getByText("NFT minted!")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("table-row").first()).toBeVisible({ timeout: 15_000 });
});

test("API /api/stats returns both chains", async ({ request }) => {
  const res = await request.get("http://localhost:9999/api/stats");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.length).toBe(2);
  expect(data.map((s: any) => s.chain).sort()).toEqual(["cardano", "evm"]);
});

test("API /api/events returns indexed events", async ({ request }) => {
  const res = await request.get("http://localhost:9999/api/events?limit=10&offset=0");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.length).toBeGreaterThan(0);
});
