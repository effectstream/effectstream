import React, { useEffect, useState, useCallback } from "react";
import type { Address } from "viem";
import { CurrencyToggle } from "../components/CurrencyToggle.tsx";
import { adminAddress, createCampaign, setProduct, endCampaign, setCoin, mintNfts, getAdminBalance } from "../wallet/admin-wallet.ts";
import { WalletConfirmModal } from "../wallet/WalletConfirmModal.tsx";
import { AddressChip } from "../components/AddressChip.tsx";
import { useLog } from "../logs/LogContext.tsx";

const CAMPAIGN_ID = "test-launchpad-1";

// Products-list price selector — keyed by coin id; amounts come from the API (P * x * 10^n).
const LIST_CURRENCIES = [
  { address: "eth", symbol: "ETH" },
  { address: "usdc", symbol: "USDC" },
  { address: "ada", symbol: "ADA" },
];

type AdminCoin = {
  token: string;
  symbol: string;
  chain: string;
  paymentToken: string;
  type: string;
  x: string;
  n: number;
  decimals: number;
};

// Display a per-coin smallest-unit amount divided by that coin's decimals.
function formatCoinAmount(
  amounts: Record<string, string> | undefined,
  coinId: string,
  coins: AdminCoin[],
): string {
  const amt = amounts?.[coinId];
  const coin = coins.find((c) => c.token === coinId);
  if (amt == null || !coin) return "—";
  return `${(Number(amt) / 10 ** coin.decimals).toFixed(coin.decimals <= 6 ? 2 : 4)} ${coin.symbol}`;
}

type AdminStatus = {
  coins?: AdminCoin[];
  campaign: {
    campaignId: string;
    slug: string;
    name: string;
    status: string;
    launchpad: string;
    receiver: string;
    cardanoPaymentAddress?: string;
    admin: string;
    referralDiscountBps: number;
    referrerRewardBps: number;
  };
  items: {
    id: number;
    name: string;
    description?: string;
    image?: string;
    supply?: number;
    purchased: number;
    kind?: string;
    price?: string;
    amounts?: Record<string, string>;
  }[];
  payments: {
    id: number;
    chain: string;
    wallet: string;
    payment_token: string;
    amount: string;
    item_ids: string;
    status: string;
    reason: string;
    block_height: number;
  }[];
  referralRewards?: {
    id: number;
    referrer: string;
    buyer: string;
    chain: string;
    payment_token: string;
    amount: string;
    tx_hash: string;
    block_height: number;
  }[];
  nftMints?: {
    chain: string;
    wallet: string;
    item_id: number;
    quantity: number;
    status: string;
    tx_hash?: string;
    error?: string;
  }[];
  nftMintSummary?: Record<string, number>;
  summary: { total: number; valid: number; invalid: number };
};

type AppConfig = {
  launchpad: string;
  effectStreamL2: string;
  mockUsdc: string;
  admin: string;
  chainId: number;
  evmRpc: string;
  cardanoReceiptPolicyId: string;
  coins?: AdminCoin[];
};

export function AdminPanel({ apiUrl }: { apiUrl: string }) {
  const { addLog } = useLog();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const l2 = (config?.effectStreamL2 ?? null) as Address | null;
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // Pending admin action awaiting wallet confirmation (the admin always signs with the local dev
  // key, so — like a purchase — we surface a Sign Transaction modal before submitting on-chain).
  const [confirmTx, setConfirmTx] = useState<{ summary: string; run: () => Promise<void> } | null>(null);
  const [adminBalance, setAdminBalance] = useState("0");

  // Campaign form
  const [campaignId, setCampaignId] = useState(CAMPAIGN_ID);
  const [name, setName] = useState("Test Launchpad 1");
  const [description, setDescription] = useState("A demo preorder/launchpad");
  const [referrerRewardBps, setReferrerRewardBps] = useState(500);

  // Product form
  const [pId, setPId] = useState(1);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pKind, setPKind] = useState<"standard" | "reward">("standard");
  const [pPrice, setPPrice] = useState("5"); // unitless integer price P (≈ USD)
  const [pSupply, setPSupply] = useState("");
  const [pImage, setPImage] = useState("");
  // Edit mode locks the item id (changing it would create a NEW product instead of updating).
  const [isEditMode, setIsEditMode] = useState(false);
  // Coin id shown in the products list price column.
  const [listCcy, setListCcy] = useState<string>("eth");

  // Coin-rate edit form (set-coin). Defaults to the ETH row.
  const [cToken, setCToken] = useState("eth");
  const [cX, setCX] = useState("5");
  const [cN, setCN] = useState("14");

  useEffect(() => {
    fetch(`${apiUrl}/api/config`)
      .then((r) => r.json())
      .then((c) => setConfig(c as AppConfig))
      .catch(() => addLog("error", "Failed to load /api/config"));
  }, [apiUrl]);

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/status/${CAMPAIGN_ID}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStatus(s))
      .catch(() => {});
  }, [apiUrl, tick]);

  // Poll a few times after a submit so the post-COMMIT state shows up.
  const refreshSoon = useCallback(() => {
    let n = 0;
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      if (++n >= 8) clearInterval(iv);
    }, 1500);
  }, []);

  // Surface a Sign Transaction modal (admin signs with the local dev key) before submitting.
  const requestConfirm = useCallback((summary: string, run: () => Promise<void>) => {
    getAdminBalance()
      .then((b) => setAdminBalance((Number(b) / 1e18).toFixed(4)))
      .catch(() => setAdminBalance("?"));
    setConfirmTx({ summary, run });
  }, []);

  const submitCampaign = async () => {
    if (!l2) return;
    setBusy(true);
    try {
      const config = {
        slug: campaignId,
        name,
        description,
        launchpadAddress: status?.campaign.launchpad,
        receiver: adminAddress(),
        referrerRewardBps,
        referralDiscountBps: 100,
        timestampStartPublicSale: 0,
        timestampEndSale: 9999999999,
        items: [],
        curatedPackages: [],
      };
      const { txHash } = await createCampaign(l2, campaignId, config);
      addLog("success", `create-campaign submitted: ${campaignId}`, txHash);
      refreshSoon();
    } catch (e: any) {
      addLog("error", "create-campaign failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitProduct = async () => {
    if (!l2) return;
    setBusy(true);
    try {
      const product: any = {
        id: pId,
        name: pName || `Item ${pId}`,
        description: pDesc,
        kind: pKind,
        price: Number(pPrice) || 0, // unitless integer; per-coin amount = price * coin.x * 10^coin.n
      };
      if (pImage.trim()) product.image = pImage.trim(); // omit → frontend uses the default effect
      if (pSupply.trim()) product.supply = Number(pSupply);
      const { txHash } = await setProduct(l2, campaignId, product);
      addLog("success", `set-product submitted: item ${pId}`, txHash);
      refreshSoon();
    } catch (e: any) {
      addLog("error", "set-product failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitEnd = async () => {
    if (!l2) return;
    setBusy(true);
    try {
      const { txHash } = await endCampaign(l2, campaignId);
      addLog("success", `end-campaign submitted: ${campaignId}`, txHash);
      refreshSoon();
    } catch (e: any) {
      addLog("error", "end-campaign failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitMintNfts = async () => {
    if (!l2) return;
    setBusy(true);
    try {
      const { txHash } = await mintNfts(l2, campaignId);
      addLog("success", `mint-nfts submitted: ${campaignId}`, txHash);
      refreshSoon();
    } catch (e: any) {
      addLog("error", "mint-nfts failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  // Prefill the form from an existing product (UPDATE mode — id is locked so the same product
  // is overwritten rather than a new one created).
  const editProduct = (it: AdminStatus["items"][number]) => {
    setPId(it.id);
    setPName(it.name);
    setPDesc(it.description ?? "");
    setPKind(it.kind === "reward" ? "reward" : "standard");
    setPPrice(String(it.price ?? "0"));
    setPSupply(it.supply != null ? String(it.supply) : "");
    setPImage(it.image ?? "");
    setIsEditMode(true);
    addLog("info", `Editing product #${it.id}`, "form prefilled — adjust and Update");
  };

  // Reset the form for a brand-new product (ADD mode — id is editable, defaulted to the next free id).
  const newProduct = () => {
    const nextId = status && status.items.length > 0
      ? Math.max(...status.items.map((i) => i.id)) + 1
      : 1;
    setPId(nextId);
    setPName("");
    setPDesc("");
    setPKind("standard");
    setPPrice("5");
    setPSupply("");
    setPImage("");
    setIsEditMode(false);
  };

  // Prefill the coin-rate form from an existing coin, then submit set-coin to update x/n.
  const coinsList = status?.coins ?? config?.coins ?? [];
  const editCoin = (c: AdminCoin) => {
    setCToken(c.token);
    setCX(String(c.x));
    setCN(String(c.n));
    addLog("info", `Editing coin ${c.token}`, "adjust x / n and submit set-coin");
  };
  const submitCoin = async () => {
    if (!l2) return;
    setBusy(true);
    try {
      const base = coinsList.find((c) => c.token === cToken);
      const coin = {
        token: cToken,
        symbol: base?.symbol ?? cToken.toUpperCase(),
        chain: base?.chain ?? "evm",
        paymentToken: base?.paymentToken ?? "0x0000000000000000000000000000000000000000",
        type: base?.type ?? "",
        x: cX,
        n: Number(cN) || 0,
        decimals: base?.decimals ?? 18,
      };
      const { txHash } = await setCoin(l2, coin);
      addLog("success", `set-coin submitted: ${cToken} x=${cX} n=${cN}`, txHash);
      refreshSoon();
    } catch (e: any) {
      addLog("error", "set-coin failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-panel" style={{ maxWidth: 960, margin: "0 auto", padding: "32px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Admin Console</h1>
      <p style={{ color: "#8b949e", fontSize: 13, marginBottom: 8 }}>
        Commands are submitted on-chain to the EffectstreamL2 contract and processed deterministically
        by the state machine (authorized by the admin signer).
      </p>
      <p style={{ color: "#6e7681", fontSize: 12, fontFamily: "monospace", marginBottom: 24 }}>
        Acting as admin: {adminAddress()} · L2: {l2 ?? "loading..."}
      </p>

      {/* Contracts & wallets — informative */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Contracts &amp; wallets</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28 }}>
          <div>
            <div style={subHeadStyle}>EVM — Hardhat (chain {config?.chainId ?? "?"})</div>
            <KV label="RPC" value={config?.evmRpc ?? "—"} mono />
            <KV label="Launchpad (PaimaLaunchpad)" value={<AddressChip value={config?.launchpad} />} />
            <KV label="EffectstreamL2 inbox" value={<AddressChip value={config?.effectStreamL2} />} />
            <KV label="MockUSDC token" value={<AddressChip value={config?.mockUsdc} />} />
            <KV label="Admin / owner wallet" value={<AddressChip value={config?.admin} />} />
            <KV label="Campaign receiver" value={<AddressChip value={status?.campaign.receiver} />} />
            <KV label="Referral discount" value={status ? `${status.campaign.referralDiscountBps} bps` : "—"} />
            <KV label="Referrer reward" value={status ? `${status.campaign.referrerRewardBps} bps` : "—"} />
          </div>
          <div>
            <div style={subHeadStyle}>Cardano — YACI / Dolos</div>
            <KV label="Payment address" value={<AddressChip value={status?.campaign.cardanoPaymentAddress} head={10} tail={8} />} />
            <KV label="Receipt minting policy id" value={<AddressChip value={config?.cardanoReceiptPolicyId} />} />
          </div>
        </div>
      </section>

      {/* Update campaign */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Update campaign</h2>
        <div style={formGrid}>
          <Field label="Campaign id (locked)">
            <input
              style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }}
              value={campaignId} disabled
              onChange={(e) => setCampaignId(e.target.value)}
            />
          </Field>
          <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Referrer reward bps"><input style={inputStyle} type="number" value={referrerRewardBps} onChange={(e) => setReferrerRewardBps(Number(e.target.value))} /></Field>
        </div>
        <button data-testid="admin-update-campaign" style={btnStyle} disabled={busy || !l2}
          onClick={() => requestConfirm(`update-campaign · ${campaignId}`, submitCampaign)}>
          {busy ? "Submitting…" : "Update campaign"}
        </button>
      </section>

      {/* Sales / campaign status */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Sales &amp; campaign status</h2>
        {status ? (
          <>
            <div style={{ marginBottom: 18 }}>
              <KV label="Campaign" value={status.campaign.slug} />
              <KV
                label="Status"
                value={status.campaign.status}
                color={status.campaign.status === "active" ? "#19B17B" : "#f85149"}
              />
              <KV label="Payments (total)" value={String(status.summary.total)} />
              <KV label="Valid" value={String(status.summary.valid)} color="#19B17B" />
              <KV label="Invalid" value={String(status.summary.invalid)} color="#f85149" />
            </div>
            <table data-testid="payments-table" style={tableStyle}>
              <thead>
                <tr>
                  {["chain", "wallet", "token", "amount", "items", "status", "reason"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.payments.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.chain}</td>
                    <td style={tdStyle}><AddressChip value={p.wallet} /></td>
                    <td style={tdStyle}><AddressChip value={p.payment_token} /></td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{p.amount}</td>
                    <td style={tdStyle}>{p.item_ids}</td>
                    <td style={{ ...tdStyle, color: p.status === "valid" ? "#19B17B" : "#f85149", fontWeight: 600 }}>{p.status}</td>
                    <td style={{ ...tdStyle, color: "#8b949e" }}>{p.reason}</td>
                  </tr>
                ))}
                {status.payments.length === 0 && (
                  <tr><td style={tdStyle} colSpan={7}>No payments yet</td></tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <p style={{ color: "#8b949e" }}>Loading status… (campaign may not be seeded yet)</p>
        )}
      </section>

      {/* Products */}
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ ...h2Style, marginBottom: 0 }}>Products</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CurrencyToggle currencies={LIST_CURRENCIES} active={listCcy} onChange={setListCcy} />
            <button data-testid="admin-new-product" onClick={newProduct}
              style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "#161b22", border: "1px solid #30363d", color: "#58a6ff", cursor: "pointer", whiteSpace: "nowrap" }}>
              + New product
            </button>
          </div>
        </div>
        {status && status.items.length > 0 ? (
          <table data-testid="products-table" style={tableStyle}>
            <thead>
              <tr>
                {["id", "name", "kind", "supply", "sold", "P", "price", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.items.map((it) => (
                <tr key={it.id}>
                  <td style={tdStyle}>{it.id}</td>
                  <td style={tdStyle}>{it.name}</td>
                  <td style={tdStyle}>{it.kind ?? "standard"}</td>
                  <td style={tdStyle}>{it.supply ?? "∞"}</td>
                  <td style={tdStyle}>{it.purchased}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{it.price ?? "0"}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{formatCoinAmount(it.amounts, listCcy, coinsList)}</td>
                  <td style={tdStyle}>
                    <button
                      data-testid={`admin-edit-product-${it.id}`}
                      onClick={() => editProduct(it)}
                      style={{
                        padding: "4px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                        background: "#161b22", border: "1px solid #30363d", color: "#58a6ff", cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#8b949e", fontSize: 13 }}>No products yet — add one below.</p>
        )}

        <div style={{ ...subHeadStyle, marginTop: 22 }}>
          {isEditMode ? `Update product #${pId}` : "Add new product"}
        </div>
        <div style={formGrid}>
          <Field label={isEditMode ? "Item id (locked)" : "Item id"}>
            <input
              style={{ ...inputStyle, ...(isEditMode ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              type="number" value={pId} disabled={isEditMode}
              onChange={(e) => setPId(Number(e.target.value))}
            />
          </Field>
          <Field label="Name"><input style={inputStyle} value={pName} onChange={(e) => setPName(e.target.value)} /></Field>
          <Field label="Description"><input style={inputStyle} value={pDesc} onChange={(e) => setPDesc(e.target.value)} /></Field>
          <Field label="Kind">
            <select style={inputStyle} value={pKind} onChange={(e) => setPKind(e.target.value as any)}>
              <option value="standard">standard</option>
              <option value="reward">reward (free-at threshold)</option>
            </select>
          </Field>
          <Field label={pKind === "reward" ? "Unlock threshold (unitless ≈ USD)" : "Price (unitless ≈ USD)"}>
            <input style={inputStyle} type="number" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
          </Field>
          <Field label="Supply (blank = unlimited)"><input style={inputStyle} value={pSupply} onChange={(e) => setPSupply(e.target.value)} /></Field>
          <Field label="Image URL (blank = default effect)"><input style={inputStyle} value={pImage} placeholder="https://… (optional)" onChange={(e) => setPImage(e.target.value)} /></Field>
        </div>
        <button data-testid="admin-set-product" style={btnStyle} disabled={busy || !l2}
          onClick={() => requestConfirm(`${isEditMode ? "update" : "add"}-product · item ${pId}`, submitProduct)}>
          {busy ? "Submitting…" : isEditMode ? `Update product #${pId}` : "Add product"}
        </button>
      </section>

      {/* Coins & rates — amount = P * x * 10^n */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Coins &amp; rates</h2>
        <p style={{ color: "#8b949e", fontSize: 12, marginBottom: 12 }}>
          A unitless item price P maps to each coin's smallest unit as <code>P · x · 10^n</code> — exact integer math, no rounding.
        </p>
        {coinsList.length > 0 ? (
          <table data-testid="coins-table" style={tableStyle}>
            <thead>
              <tr>
                {["token", "symbol", "chain", "x", "n", "decimals", "P=1 →", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coinsList.map((c) => (
                <tr key={c.token}>
                  <td style={tdStyle}>{c.token}</td>
                  <td style={tdStyle}>{c.symbol}</td>
                  <td style={tdStyle}>{c.chain}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{c.x}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{c.n}</td>
                  <td style={tdStyle}>{c.decimals}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                    {formatCoinAmount({ [c.token]: (BigInt(c.x) * 10n ** BigInt(c.n)).toString() }, c.token, coinsList)}
                  </td>
                  <td style={tdStyle}>
                    <button
                      data-testid={`admin-edit-coin-${c.token}`}
                      onClick={() => editCoin(c)}
                      style={{
                        padding: "4px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                        background: "#161b22", border: "1px solid #30363d", color: "#58a6ff", cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#8b949e", fontSize: 13 }}>No coins.</p>
        )}

        <div style={{ ...subHeadStyle, marginTop: 22 }}>Update coin rate (set-coin) — token {cToken}</div>
        <div style={formGrid}>
          <Field label="Coin token (locked — pick via Edit)">
            <input
              style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }}
              value={cToken} disabled
              onChange={(e) => setCToken(e.target.value)}
            />
          </Field>
          <Field label="Multiplier x"><input style={inputStyle} value={cX} onChange={(e) => setCX(e.target.value)} /></Field>
          <Field label="Exponent n (10^n)"><input style={inputStyle} type="number" value={cN} onChange={(e) => setCN(e.target.value)} /></Field>
        </div>
        <button data-testid="admin-set-coin" style={btnStyle} disabled={busy || !l2}
          onClick={() => requestConfirm(`set-coin · ${cToken} x=${cX} n=${cN}`, submitCoin)}>
          {busy ? "Submitting…" : "Update coin"}
        </button>
      </section>

      {/* Referral payouts — captured from the on-chain ReferrerReward (EVM) + receipt (Cardano) */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Referral payouts</h2>
        {status && status.referralRewards && status.referralRewards.length > 0 ? (
          <table data-testid="referrals-table" style={tableStyle}>
            <thead>
              <tr>
                {["chain", "referrer", "buyer", "reward (smallest unit)", "tx"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.referralRewards.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.chain}</td>
                  <td style={tdStyle}><AddressChip value={r.referrer} /></td>
                  <td style={tdStyle}><AddressChip value={r.buyer} /></td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{r.amount}</td>
                  <td style={tdStyle}><AddressChip value={r.tx_hash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#8b949e", fontSize: 13 }}>No referral payouts yet.</p>
        )}
      </section>

      {/* Post-sale NFT minting */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Post-sale NFT minting</h2>
        <p style={{ color: "#8b949e", fontSize: 12, marginBottom: 12 }}>
          After the campaign ends, mint an item NFT to every buyer for each item they own. Jobs are
          submitted to the batcher, which holds funds and performs the actual mint.
        </p>
        <button
          data-testid="admin-mint-nfts"
          style={{ ...btnStyle, background: "#1f6f5f", border: "1px solid #2ea08c" }}
          disabled={busy || !l2 || status?.campaign.status !== "ended"}
          onClick={() => requestConfirm(`mint-nfts · ${campaignId}`, submitMintNfts)}
        >
          {busy
            ? "Submitting…"
            : status?.campaign.status === "ended"
              ? "Mint item NFTs"
              : "End campaign first"}
        </button>
        {status?.nftMintSummary && Object.keys(status.nftMintSummary).length > 0 && (
          <div data-testid="nft-mint-summary" style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, fontFamily: "monospace" }}>
            {Object.entries(status.nftMintSummary).map(([s, n]) => (
              <span key={s} style={{ color: s === "minted" ? "#3fb950" : s === "failed" ? "#f85149" : "#d29922" }}>
                {s}: {n}
              </span>
            ))}
          </div>
        )}
        {status && status.nftMints && status.nftMints.length > 0 && (
          <table data-testid="nft-mints-table" style={{ ...tableStyle, marginTop: 12 }}>
            <thead>
              <tr>{["chain", "wallet", "item", "qty", "status", "tx"].map((h) => (<th key={h} style={thStyle}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {status.nftMints.slice(0, 20).map((m, i) => (
                <tr key={`${m.chain}-${m.wallet}-${m.item_id}-${i}`}>
                  <td style={tdStyle}>{m.chain}</td>
                  <td style={tdStyle}><AddressChip value={m.wallet} /></td>
                  <td style={tdStyle}>{m.item_id}</td>
                  <td style={tdStyle}>{m.quantity}</td>
                  <td style={{ ...tdStyle, color: m.status === "minted" ? "#3fb950" : m.status === "failed" ? "#f85149" : "#d29922" }}>{m.status}</td>
                  <td style={tdStyle}>{m.tx_hash ? <AddressChip value={m.tx_hash} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* End campaign */}
      <section style={cardStyle}>
        <h2 style={h2Style}>End campaign</h2>
        <button data-testid="admin-end-campaign" style={{ ...btnStyle, background: "#5f1f2a", border: "1px solid #78263a" }} disabled={busy || !l2}
          onClick={() => requestConfirm(`end-campaign · ${campaignId}`, submitEnd)}>
          {busy ? "Submitting…" : `End ${campaignId}`}
        </button>
      </section>

      {confirmTx && l2 && (
        <WalletConfirmModal
          chain="evm"
          items={[{ id: 0, name: confirmTx.summary, quantity: 1, price: "0" }]}
          totalDisplay="0"
          recipientAddress={l2}
          balance={adminBalance}
          currencySymbol="ETH"
          onConfirm={async () => {
            const { run } = confirmTx;
            setConfirmTx(null);
            await run();
          }}
          onReject={() => {
            setConfirmTx(null);
            addLog("info", "Admin transaction rejected");
          }}
        />
      )}
    </div>
  );
}

function KV({ label, value, mono, color }: { label: string; value: React.ReactNode; mono?: boolean; color?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline",
      padding: "7px 0", borderBottom: "1px solid #161b22",
    }}>
      <span style={{ fontSize: 12, color: "#8b949e", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12.5, color: color ?? "#e6edf3", textAlign: "right",
        fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all",
      }}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#8b949e" }}>{label}</span>
      {children}
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #21262d", borderRadius: 12, background: "#0d1117", padding: 20, marginBottom: 20,
};
const h2Style: React.CSSProperties = { fontSize: 16, marginBottom: 14, color: "#c9d1d9" };
const subHeadStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#6e7681", textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #21262d",
};
const formGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14,
};
const inputStyle: React.CSSProperties = {
  background: "#161b22", border: "1px solid #30363d", borderRadius: 6, padding: "8px 10px",
  color: "#e6edf3", fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 6, background: "#238636", border: "1px solid #2ea043",
  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "6px 8px", color: "#6e7681", borderBottom: "1px solid #21262d",
  textTransform: "uppercase", fontSize: 10, letterSpacing: "0.5px",
};
const tdStyle: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #161b22", color: "#c9d1d9" };
