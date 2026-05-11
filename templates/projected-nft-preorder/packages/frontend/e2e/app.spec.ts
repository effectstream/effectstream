import { test, expect } from "@playwright/test";

const API = "http://localhost:9999";

// ── App structure ───────────────────────────────────────────────────────────

test.describe("App structure", () => {
  test("renders header and log panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Projected NFT Pre-Order");
    await expect(page.getByTestId("log-panel")).toBeVisible();
    await expect(page.getByTestId("connect-wallet-btn")).toBeVisible();
  });

  test("has dark theme background", async ({ page }) => {
    await page.goto("/");
    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).toBe("rgb(10, 14, 26)");
  });

  test("shows unlocked and locked columns", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Unlocked", { exact: true })).toBeVisible();
    await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  });

  test("shows All/My filter on locked column", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("filter-all")).toBeVisible();
    await expect(page.getByTestId("filter-my")).toBeVisible();
  });

  test("My NFTs filter is disabled without wallet", async ({ page }) => {
    await page.goto("/");
    const myBtn = page.getByTestId("filter-my");
    await expect(myBtn).toBeDisabled();
  });

  test("frontend makes no POST/PATCH/DELETE to the node API", async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", (req) => {
      const method = req.method();
      const url = req.url();
      if ((method !== "GET" && method !== "OPTIONS") && url.includes(":9999")) {
        mutations.push(`${method} ${url}`);
      }
    });
    await page.goto("/");
    await page.waitForTimeout(3_000);
    expect(mutations).toEqual([]);
  });
});

// ── API health (GET-only) ──────────────────────────────────────────────────

test.describe("API health", () => {
  test("GET /api/locks returns array", async ({ request }) => {
    const res = await request.get(`${API}/api/locks`);
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test("GET /api/cardano/script-hash returns hash", async ({ request }) => {
    const res = await request.get(`${API}/api/cardano/script-hash`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.scriptHash).toBe("string");
    expect(body.scriptHash.length).toBeGreaterThan(0);
  });

  test("GET /api/cardano/script-address returns address", async ({ request }) => {
    const res = await request.get(`${API}/api/cardano/script-address`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.scriptAddress).toBe("string");
    expect(body.scriptAddress.length).toBeGreaterThan(0);
  });

  test("API has no POST endpoints", async ({ request }) => {
    const postRes = await request.post(`${API}/api/cardano/connect`);
    expect(postRes.status()).toBe(404);
  });
});

// ── Full lifecycle via browser wallet ──────────────────────────────────────

test.describe("Browser wallet lifecycle", () => {
  test("mint → lock → unlock → claim via frontend wallet", async ({ page }) => {
    test.setTimeout(300_000);

    // ── Connect wallet ─────────────────────────────────────────────────

    await test.step("Connect dev wallet via UI", async () => {
      await page.goto("/");

      // Ensure clean state
      await page.evaluate(() => localStorage.clear());

      await page.getByTestId("connect-wallet-btn").click();
      await page.locator("button:has-text('Generate Dev Wallet')").click();

      await expect(page.getByTestId("wallet-address")).toBeVisible({
        timeout: 120_000,
      });
      const addr = await page.getByTestId("wallet-address").textContent();
      expect(addr).toContain("...");
    });

    // ── Mint section visible ─────────────────────────────────────────

    await test.step("Mint section appears after wallet connect", async () => {
      await expect(page.getByTestId("mint-section")).toBeVisible();
      await expect(page.getByTestId("mint-btn")).toBeVisible();
    });

    // ── Mint NFT ───────────────────────────────────────────────────────

    await test.step("Mint test NFT via browser wallet", async () => {
      const input = page.getByTestId("asset-name-input");
      await input.clear();
      await input.fill("E2EBrowserNFT");

      await page.getByTestId("mint-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).toBeVisible();
      await page.getByTestId("tx-confirm-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).not.toBeVisible({
        timeout: 60_000,
      });

      // NFT appears in the Unlocked column
      const nftCard = page
        .locator("[data-testid='wallet-nft-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .first();
      await expect(nftCard).toBeVisible({ timeout: 10_000 });
    });

    // ── Lock NFT ───────────────────────────────────────────────────────

    await test.step("Lock NFT at Hololocker via browser wallet", async () => {
      const nftCard = page
        .locator("[data-testid='wallet-nft-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .first();
      await nftCard.getByTestId("lock-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).toBeVisible();
      await page.getByTestId("tx-confirm-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).not.toBeVisible({
        timeout: 60_000,
      });
    });

    // ── Frontend shows lock in Locked column ───────────────────────────

    await test.step("Locked column shows NFT from EffectStream", async () => {
      const lockedCard = page
        .locator("[data-testid='lock-card']")
        .filter({ hasText: "Locked at Script" })
        .filter({ hasText: /E2EBrowserNFT/ })
        .first();
      await expect(lockedCard).toBeVisible({ timeout: 60_000 });
      await expect(lockedCard.locator("text=(YOU)")).toBeVisible();
      await expect(lockedCard.locator("text=Block #")).toBeVisible();
    });

    // ── My NFTs filter works ───────────────────────────────────────────

    await test.step("My NFTs filter shows only owned locks", async () => {
      await page.getByTestId("filter-my").click();
      const myCards = page.locator("[data-testid='lock-card']");
      const count = await myCards.count();
      expect(count).toBeGreaterThan(0);

      // Every visible card should have (YOU)
      for (let i = 0; i < count; i++) {
        await expect(myCards.nth(i).locator("text=(YOU)")).toBeVisible();
      }

      // Switch back to All
      await page.getByTestId("filter-all").click();
    });

    // ── Unlock NFT ─────────────────────────────────────────────────────

    await test.step("Request unlock via browser wallet", async () => {
      const lockedCard = page
        .locator("[data-testid='lock-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .filter({ hasText: "Locked at Script" })
        .first();

      await lockedCard.getByTestId("unlock-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).toBeVisible();
      await page.getByTestId("tx-confirm-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).not.toBeVisible({
        timeout: 60_000,
      });
    });

    // ── Frontend shows Withdrawal Requested ────────────────────────────

    await test.step("Locked column shows 'Withdrawal Requested'", async () => {
      const unlockingCard = page
        .locator("[data-testid='lock-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .filter({ hasText: "Withdrawal Requested" })
        .first();
      await expect(unlockingCard).toBeVisible({ timeout: 60_000 });
    });

    // ── Wait for time lock + Claim ─────────────────────────────────────

    await test.step("Claim NFT after time lock expires", async () => {
      await page.waitForTimeout(30_000);

      const unlockingCard = page
        .locator("[data-testid='lock-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .filter({ hasText: "Withdrawal Requested" })
        .first();

      const claimBtn = unlockingCard.getByTestId("claim-btn");
      await expect(claimBtn).toBeVisible();
      await claimBtn.click();

      await expect(page.getByTestId("tx-confirm-modal")).toBeVisible();
      await page.getByTestId("tx-confirm-btn").click();

      await expect(page.getByTestId("tx-confirm-modal")).not.toBeVisible({
        timeout: 60_000,
      });
    });

    // ── NFT returns to Unlocked column ─────────────────────────────────

    await test.step("NFT returns to Unlocked column after claim", async () => {
      const walletCard = page
        .locator("[data-testid='wallet-nft-card']")
        .filter({ hasText: /E2EBrowserNFT/ })
        .first();
      await expect(walletCard).toBeVisible({ timeout: 30_000 });
    });

    // ── Log panel captured events ──────────────────────────────────────

    await test.step("Log panel shows lifecycle events", async () => {
      const logText = await page.getByTestId("log-panel").textContent();
      expect(logText).toContain("Lock events updated");
      expect(logText).toContain("Wallet address:");
    });
  });
});
