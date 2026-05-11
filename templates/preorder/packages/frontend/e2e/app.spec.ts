import { test, expect } from "@playwright/test";
import { Lucid, type LucidEvolution } from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import { generateSeedPhrase, PROTOCOL_PARAMETERS_DEFAULT } from "@lucid-evolution/utils";

const API_BASE = "http://localhost:9999";
const YACI_BASE = "http://localhost:10000/local-cluster/api";
const DOLOS_BLOCKFROST = "http://localhost:3000";
const EVM_WALLET_ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function createTestCardanoWallet(): Promise<{ lucid: LucidEvolution; address: string }> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST, "dev");
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_BASE}/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: hexToBytes(tx),
    });
    if (!res.ok) throw new Error(`TX submit failed (${res.status}): ${await res.text()}`);
    return (await res.text()).replace(/^"|"$/g, "");
  };
  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });
  const seed = generateSeedPhrase();
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  // Topup via YACI
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${YACI_BASE}/addresses/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, adaAmount: 10_000 }),
      });
      if (res.ok) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Wait for UTxOs to appear via Dolos
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const utxos = await lucid.utxosAt(address);
    if (utxos.length > 0) return { lucid, address };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for Cardano UTxOs");
}

async function connectEvmLocal(page: any) {
  await page.getByTestId("connect-evm-btn").click();
  await page.getByTestId("connect-evm-local").click();
  await expect(page.getByTestId("wallet-connect-modal")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("wallet-connect-approve").click();
}

async function connectCardanoDev(page: any) {
  await page.getByTestId("connect-cardano-btn").click();
  await page.getByTestId("connect-cardano-dev").click();
  await expect(page.getByTestId("wallet-connect-modal")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("wallet-connect-approve").click();
}

async function pollUserItems(
  request: any,
  slug: string,
  wallet: string,
  opts: { timeoutMs?: number; expectItemId?: number } = {},
): Promise<any[]> {
  const { timeoutMs = 60_000, expectItemId } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(
      `${API_BASE}/api/userData/${slug}?wallet=${wallet}`,
    );
    if (res.ok()) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        if (expectItemId === undefined) return data.items;
        if (data.items.some((i: any) => i.item_id === expectItemId))
          return data.items;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------
test.describe("Launchpad detail page", () => {
  test("renders launchpad title", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("launchpad-title"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows item cards", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("item-card").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("wallet panel is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("wallet-panel"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("countdown timer is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("countdown-timer"),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// EVM wallet flow (UI)
// ---------------------------------------------------------------------------
test.describe("EVM wallet flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("wallet-panel"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("connect local EVM wallet", async ({ page }) => {
    await connectEvmLocal(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("wallet-chain")).toHaveText("EVM");
  });

  test("EVM purchase flow with confirmation modal", async ({ page }) => {
    await connectEvmLocal(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("item-1-plus").first().click();
    await expect(page.getByTestId("item-1-qty").first()).toHaveText("1");

    await expect(page.getByTestId("order-summary")).toBeVisible();

    await page.getByTestId("purchase-button").click();
    await expect(page.getByTestId("wallet-confirm-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("wallet-confirm-btn").click();

    await expect(page.getByTestId("purchase-status")).toContainText(
      "successful",
      { timeout: 60_000 },
    );
  });

  test("confirmation modal reject cancels purchase", async ({ page }) => {
    await connectEvmLocal(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("item-1-plus").first().click();
    await page.getByTestId("purchase-button").click();
    await expect(page.getByTestId("wallet-confirm-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("wallet-reject-btn").click();

    await expect(page.getByTestId("wallet-confirm-modal")).not.toBeVisible();
    await expect(page.getByTestId("purchase-status")).not.toBeVisible();
  });

  test("disconnect wallet", async ({ page }) => {
    await connectEvmLocal(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("disconnect-wallet").click();
    await expect(page.getByTestId("connect-evm-btn")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Cardano wallet flow (UI)
// ---------------------------------------------------------------------------
test.describe("Cardano wallet flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("wallet-panel"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create dev Cardano wallet", async ({ page }) => {
    await connectCardanoDev(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("wallet-chain")).toHaveText("Cardano");
  });

  test("Cardano payment flow with confirmation modal", async ({ page }) => {
    await connectCardanoDev(page);
    await expect(
      page.getByTestId("wallet-address"),
    ).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("item-1-plus").first().click();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    await page.getByTestId("purchase-button").click();
    await expect(page.getByTestId("wallet-confirm-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("wallet-confirm-btn").click();

    await expect(page.getByTestId("purchase-status")).toContainText(
      "successful",
      { timeout: 60_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------
test.describe("API endpoints", () => {
  test("launchpads list", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/launchpads`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.launchpads.length).toBeGreaterThan(0);
  });

  test("first-block endpoint", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/first-block`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect("timestamp" in data).toBeTruthy();
  });

  test("cardano wallet create + balance (client-side)", async () => {
    const { lucid, address } = await createTestCardanoWallet();
    const utxos = await lucid.utxosAt(address);
    const balance = utxos.reduce((sum, u) => sum + (u.assets.lovelace || 0n), 0n);
    expect(balance).toBeGreaterThan(0n);
  });
});

// ---------------------------------------------------------------------------
// EVM purchase — on-chain verification via primitive
// ---------------------------------------------------------------------------
test.describe("EVM purchase verification", () => {
  test("EVM purchase is recorded by primitive and queryable via API", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("wallet-panel")).toBeVisible({ timeout: 10_000 });

    await connectEvmLocal(page);
    await expect(page.getByTestId("wallet-address")).toBeVisible({ timeout: 10_000 });

    // Buy item 2 x1
    await page.getByTestId("item-2-plus").first().click();
    await expect(page.getByTestId("item-2-qty").first()).toHaveText("1");
    await page.getByTestId("purchase-button").click();
    await expect(page.getByTestId("wallet-confirm-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("wallet-confirm-btn").click();

    await expect(page.getByTestId("purchase-status")).toContainText(
      "successful",
      { timeout: 60_000 },
    );

    // Verify via API that the primitive recorded the purchase
    const items = await pollUserItems(request, "test-launchpad-1", EVM_WALLET_ADDRESS, {
      expectItemId: 2,
    });
    expect(items.length).toBeGreaterThan(0);
    const item2 = items.find((i: any) => i.item_id === 2);
    expect(item2).toBeTruthy();
    expect(item2.quantity).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ERC20 (USDC) purchase flow
// ---------------------------------------------------------------------------
test.describe("ERC20 purchase flow", () => {
  test("USDC currency toggle displays correct prices", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("wallet-panel")).toBeVisible({ timeout: 10_000 });

    await connectEvmLocal(page);
    await expect(page.getByTestId("wallet-address")).toBeVisible({ timeout: 10_000 });

    // Switch to USDC
    await page.getByTestId("currency-usdc").click();

    // Item prices should show USDC amounts
    const firstCard = page.getByTestId("item-card").first();
    await expect(firstCard).toContainText("USDC");

    // Purchase button should say "Buy with USDC"
    await page.getByTestId("item-5-plus").first().click();
    await expect(page.getByTestId("purchase-button")).toContainText("USDC");
  });

  test("USDC purchase succeeds on-chain", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("wallet-panel")).toBeVisible({ timeout: 10_000 });

    await connectEvmLocal(page);
    await expect(page.getByTestId("wallet-address")).toBeVisible({ timeout: 10_000 });

    // Switch to USDC and buy item 5
    await page.getByTestId("currency-usdc").click();
    await page.getByTestId("item-5-plus").first().click();
    await expect(page.getByTestId("order-summary")).toBeVisible();

    await page.getByTestId("purchase-button").click();
    await expect(page.getByTestId("wallet-confirm-modal")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("wallet-confirm-btn").click();

    // ERC20 approve + buyItemsErc20 transaction confirmed
    await expect(page.getByTestId("purchase-status")).toContainText(
      "successful",
      { timeout: 60_000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Cardano purchase — on-chain verification via CardanoTransfer primitive
// ---------------------------------------------------------------------------
test.describe("Cardano primitive integration", () => {
  test("Cardano payment with metadata is recorded via CardanoTransfer primitive", async ({
    request,
  }) => {
    // 1. Create a fresh client-side wallet
    const { lucid, address } = await createTestCardanoWallet();

    // 2. Get launchpad info for the payment address
    const lpRes = await request.get(
      `${API_BASE}/api/launchpad/test-launchpad-1`,
    );
    expect(lpRes.ok()).toBeTruthy();
    const lp = await lpRes.json();
    expect(lp.cardanoPaymentAddress).toBeTruthy();

    // 3. Send ADA payment with item metadata (client-side via Lucid)
    const toAddress = lp.cardanoPaymentAddress;
    const w = address.length > 64
      ? [address.slice(0, 64), address.slice(64)]
      : [address];
    const signed = await (
      await lucid
        .newTx()
        .pay.ToAddress(toAddress, { lovelace: 5_000_000_000n })
        .attachMetadata(42, { p: "preorder", w, i: [[1, 1]] })
        .complete()
    ).sign.withWallet().complete();
    const txHash = await signed.submit();
    expect(txHash).toBeTruthy();

    // 4. Poll until the primitive processes the tx and records items
    const items = await pollUserItems(
      request,
      "test-launchpad-1",
      address,
      { timeoutMs: 90_000, expectItemId: 1 },
    );

    // 5. Verify items were recorded in launchpad_user_items
    expect(items.length).toBeGreaterThan(0);
    const item1 = items.find((i: any) => i.item_id === 1);
    expect(item1).toBeTruthy();
    expect(item1.quantity).toBe(1);
  });

  test("Cardano payment is recorded in cardano_payments table", async ({
    request,
  }) => {
    // 1. Create wallet + pay (client-side)
    const { lucid, address } = await createTestCardanoWallet();

    const lpRes = await request.get(
      `${API_BASE}/api/launchpad/test-launchpad-1`,
    );
    const lp = await lpRes.json();
    const toAddress = lp.cardanoPaymentAddress;

    const w = address.length > 64
      ? [address.slice(0, 64), address.slice(64)]
      : [address];
    const signed = await (
      await lucid
        .newTx()
        .pay.ToAddress(toAddress, { lovelace: 3_000_000_000n })
        .attachMetadata(42, { p: "preorder", w, i: [[3, 1]] })
        .complete()
    ).sign.withWallet().complete();
    const txHash = await signed.submit();

    // 2. Poll the cardano payments endpoint
    let found = false;
    for (let i = 0; i < 30; i++) {
      const res = await request.get(
        `${API_BASE}/api/cardano-payments/test-launchpad-1`,
      );
      if (res.ok()) {
        const data = await res.json();
        if (
          Array.isArray(data.payments) &&
          data.payments.some((p: any) => p.tx_hash === txHash)
        ) {
          found = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(found).toBeTruthy();
  });
});
