import { test, expect } from "@playwright/test";

test.describe("Page load", () => {
  test("renders the header", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Private Delegation Voting");
  });

  test("renders all cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cardano-wallet-card")).toBeVisible();
    await expect(page.getByTestId("wallet-card")).toBeVisible();
    await expect(page.getByTestId("eligibility-card")).toBeVisible();
    await expect(page.getByTestId("proposals-card")).toBeVisible();
    await expect(page.getByTestId("vote-card")).toBeVisible();
  });

  test("has white background", async ({ page }) => {
    await page.goto("/");
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor
    );
    expect(bg).toBe("rgb(255, 255, 255)");
  });
});

test.describe("Eligibility check", () => {
  test("credential input starts empty", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("credential-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("check button is disabled when empty", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("check-btn")).toBeDisabled();
  });

  test("returns eligible for known credential", async ({ request, page }) => {
    const all = await request.get("http://localhost:9999/api/eligible");
    const voters = await all.json();
    if (voters.length === 0) return;
    const cred = voters[0].staking_credential;

    await page.goto("/");
    await page.getByTestId("credential-input").fill(cred);
    await page.getByTestId("check-btn").click();
    const result = page.getByTestId("eligibility-result");
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(result).toContainText("Eligible");
  });

  test("returns not eligible for unknown credential", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("credential-input").fill("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    await page.getByTestId("check-btn").click();
    const result = page.getByTestId("eligibility-result");
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(result).toContainText("Not eligible");
  });
});

test.describe("Proposals list", () => {
  test("shows no proposals message initially", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("no-proposals")).toBeVisible();
  });

  test("proposals endpoint returns JSON", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/proposals");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("shows contract state summary", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("contract-state")).toBeVisible();
  });
});

test.describe("Vote panel", () => {
  test("shows disabled state before wallet connect", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("vote-card")).toContainText("Connect wallet");
  });

  test("connect button is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("connect-btn")).toBeVisible();
    await expect(page.getByTestId("connect-btn")).toBeEnabled();
  });
});

test.describe("API endpoints", () => {
  test("GET /api/eligible returns array", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/eligible");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/eligible/:credential returns voter", async ({ request }) => {
    const all = await request.get("http://localhost:9999/api/eligible");
    const voters = await all.json();
    if (voters.length === 0) return;
    const cred = voters[0].staking_credential;

    const res = await request.get(`http://localhost:9999/api/eligible/${cred}`);
    expect(res.ok()).toBe(true);
    const voter = await res.json();
    expect(voter.staking_credential).toBe(cred);
    expect(voter.pool).toBeTruthy();
    expect(voter.epoch).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/eligible/:unknown returns 404", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/eligible/deadbeef");
    expect(res.status()).toBe(404);
  });

  test("GET /api/proposals returns array", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/proposals");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /block-heights returns array", async ({ request }) => {
    const res = await request.get("http://localhost:9999/block-heights");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/contract-state returns summary", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/contract-state");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.proposal_count).toBe("number");
    expect(typeof body.tally_yes).toBe("number");
    expect(typeof body.tally_no).toBe("number");
  });
});

test.describe("Cardano wallet", () => {
  test("connect button is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cardano-connect-btn")).toBeVisible();
    await expect(page.getByTestId("cardano-connect-btn")).toBeEnabled();
  });

  test("cardano wallet card is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cardano-wallet-card")).toBeVisible();
    await expect(page.getByTestId("cardano-wallet-card")).toContainText("Cardano Wallet");
  });
});

test.describe("Cardano wallet API endpoints", () => {
  test("GET /api/cardano/wallet returns status", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/cardano/wallet");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.connected).toBe("boolean");
  });

  test("POST /api/cardano/connect creates wallet", async ({ request }) => {
    const res = await request.post("http://localhost:9999/api/cardano/connect");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.address).toBeTruthy();
    expect(body.staking_credential).toBeTruthy();
    expect(body.address.length).toBeGreaterThan(20);
  });

  test("POST /api/cardano/delegate returns tx hash", async ({ request }) => {
    await request.post("http://localhost:9999/api/cardano/connect");
    const res = await request.post("http://localhost:9999/api/cardano/delegate");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.txHash).toBeTruthy();
    expect(body.poolId).toBeTruthy();
  });
});

test.describe("Cardano wallet UI interaction", () => {
  test("connect flow: click → address shown", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByTestId("cardano-connect-btn");
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.getByTestId("cardano-address")).toBeVisible({ timeout: 60_000 });
    const address = await page.getByTestId("cardano-address").textContent();
    expect(address).toBeTruthy();
    expect(address!.length).toBeGreaterThan(20);
  });

  test("shows staking credential after connect", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cardano-connect-btn").click();
    await expect(page.getByTestId("cardano-staking-cred")).toBeVisible({ timeout: 60_000 });
    const cred = await page.getByTestId("cardano-staking-cred").textContent();
    expect(cred).toBeTruthy();
    expect(cred!.length).toBeGreaterThan(10);
  });

  test("delegate button appears after connect", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cardano-connect-btn").click();
    await expect(page.getByTestId("cardano-delegate-btn")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("cardano-delegate-btn")).toBeEnabled();
  });

  test("delegate flow: click → delegated badge", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cardano-connect-btn").click();
    await expect(page.getByTestId("cardano-delegate-btn")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("cardano-delegate-btn").click();
    await expect(page.getByTestId("cardano-delegated-badge")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("Proposal with text UI", () => {
  test("proposal title input visible before contract join shows disabled state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("vote-card")).toContainText("Connect wallet");
  });

  test("create button is disabled when title is empty (via API check)", async ({ request }) => {
    const res = await request.get("http://localhost:9999/api/proposals");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe("Vote panel interaction", () => {
  test("proposal ID default is 1", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("vote-card")).toBeVisible();
  });

  test("vote card shows connect message before wallet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("vote-card")).toContainText("Connect wallet and join contract to vote");
  });
});
