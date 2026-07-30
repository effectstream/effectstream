import { useEffect, useRef, useState } from "react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  createIncrementInstruction,
  DEV_BATCHER_FEE_PAYER,
  DEV_BATCHER_TARGET,
  DEV_BATCHER_URL,
  DEV_NODE_API_URL,
  DEV_RPC_URL,
} from "@solana-starter/contracts-solana";

// ── Stack endpoints (the running `bun run dev` dev stack) ───────────────────
const RPC = DEV_RPC_URL;
const BATCHER_URL = DEV_BATCHER_URL;
const COUNTERS_URL = `${DEV_NODE_API_URL}/api/counters`;
const EVENTS_URL = `${DEV_NODE_API_URL}/api/counter-events?limit=50`;
const SPONSOR = new PublicKey(DEV_BATCHER_FEE_PAYER);
const ADDRESS_TYPE_SOLANA = 9; // AddressType.SOLANA
const QUICK_AMOUNTS = [1, 5, 10, 100];

type Wallet = {
  kind: "phantom" | "dev";
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

type CounterRow = {
  authority: string;
  value: string;
  slot: number | string;
  block_height: number;
};

type EventRow = {
  authority: string;
  value: string;
  slot: number | string;
  kind: string; // "increment" | "reset"
  delta: string;
};

type StatusKind = "info" | "success" | "error";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      publicKey?: { toBase58(): string };
      connect: () => Promise<{ publicKey: { toBase58(): string } }>;
      disconnect?: () => Promise<void>;
      signTransaction: (tx: Transaction) => Promise<Transaction>;
    };
  }
}

const explorerTxUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`;

const shortAddr = (addr: string) =>
  addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const eventKey = (e: EventRow) => `${e.authority}:${e.slot}:${e.delta}:${e.kind}`;

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<StatusKind>("info");
  const [lastSig, setLastSig] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<CounterRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  // First-sight timestamp per event key (for relative "time-ago"). Events carry
  // no wall-clock, so we stamp them client-side when they first appear.
  const seenRef = useRef<Map<string, number>>(new Map());

  const setStatusMsg = (msg: string, kind: StatusKind = "info", sig = "") => {
    setStatus(msg);
    setStatusKind(kind);
    setLastSig(sig);
  };

  // Poll the node's read API for the leaderboard + the increment-event log.
  useEffect(() => {
    const tick = async () => {
      try {
        const [cRes, eRes] = await Promise.all([fetch(COUNTERS_URL), fetch(EVENTS_URL)]);
        if (cRes.ok) {
          const json = await cRes.json();
          // Leaderboard: highest value first (BigInt-aware in case the API
          // order ever drifts).
          setRows(
            (json.counters ?? []).sort((a: CounterRow, b: CounterRow) => {
              const bv = BigInt(b.value);
              const av = BigInt(a.value);
              return bv > av ? 1 : bv < av ? -1 : 0;
            }),
          );
        }
        if (eRes.ok) {
          const evs: EventRow[] = (await eRes.json()).events ?? [];
          const added = new Set<string>();
          const now = Date.now();
          for (const e of evs) {
            const k = eventKey(e);
            if (!seenRef.current.has(k)) {
              seenRef.current.set(k, now);
              added.add(k);
            }
          }
          setEvents(evs);
          setNewKeys(added);
        }
      } catch { /* node not up yet */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  async function connect() {
    if (window.solana?.isPhantom) {
      const { publicKey } = await window.solana.connect();
      setWallet({
        kind: "phantom",
        publicKey: new PublicKey(publicKey.toBase58()),
        signTransaction: (tx) => window.solana!.signTransaction(tx),
      });
      setStatusMsg("Connected Phantom.");
    } else {
      // No extension — generate an in-browser dev keypair (0 SOL; gasless).
      const kp = Keypair.generate();
      setWallet({
        kind: "dev",
        publicKey: kp.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(kp);
          return tx;
        },
      });
      setStatusMsg("No Phantom found — using an in-browser dev keypair.");
    }
  }

  function disconnect() {
    window.solana?.disconnect?.().catch(() => {});
    setWallet(null);
    setStatusMsg("Disconnected.");
  }

  async function copyAddress() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  }

  async function increment() {
    if (!wallet) return;
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      setStatusMsg("Amount must be a positive integer.", "error");
      return;
    }
    setBusy(true);
    setStatusMsg("Building + signing the increment (you pay 0 SOL)…");
    try {
      const connection = new Connection(RPC, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");

      // Counter increment: fee payer is the batcher sponsor; the user is the
      // authority. The batcher co-signs as fee payer + rent payer and submits.
      const tx = new Transaction();
      tx.feePayer = SPONSOR;
      tx.recentBlockhash = blockhash;
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }));
      tx.add(createIncrementInstruction(wallet.publicKey, value, SPONSOR));

      const signed = await wallet.signTransaction(tx);
      const base64 = signed.serialize({ requireAllSignatures: false }).toString("base64");
      const userSig = signed.signatures.find(
        (s) => s.publicKey.equals(wallet.publicKey),
      )?.signature;

      setStatusMsg("Sending to the batcher (sponsor co-signs + pays gas)…");
      const res = await fetch(`${BATCHER_URL}/send-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            target: DEV_BATCHER_TARGET,
            address: wallet.publicKey.toBase58(),
            addressType: ADDRESS_TYPE_SOLANA,
            input: base64,
            signature: userSig ? bs58.encode(userSig) : "",
            timestamp: Date.now().toString(),
          },
          confirmationLevel: "wait-effectstream-processed",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMsg(`Batcher rejected: ${body.message ?? res.status}`, "error");
      } else {
        setStatusMsg(
          "✅ Sponsored on-chain — you paid 0 SOL.",
          "success",
          body.transactionHash ?? "",
        );
      }
    } catch (e) {
      setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // Aggregate stats for the logs header (increment events only).
  const incs = events.filter((e) => e.kind !== "reset");
  const totalDelta = incs.reduce((s, e) => s + BigInt(e.delta || "0"), 0n);

  return (
    <main className="wrap">
      <h1>Solana Starter — gasless counter</h1>
      <p className="sub">
        Connect a wallet and increment an on-chain counter <b>without holding any SOL</b>.
        The fee-payer batcher co-signs and pays the gas + rent; the sync node indexes it.
      </p>

      <section className="card">
        {!wallet
          ? <button onClick={connect}>Connect wallet</button>
          : (
            <>
              <div className="wallet-row">
                <span className="dot connected" title="connected" />
                <span className="tag">{wallet.kind === "phantom" ? "Phantom" : "dev key"}</span>
                <code title={wallet.publicKey.toBase58()}>
                  {shortAddr(wallet.publicKey.toBase58())}
                </code>
                <button className="copy-btn" onClick={copyAddress}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button className="copy-btn" onClick={disconnect}>Disconnect</button>
              </div>
              {wallet.kind === "dev" && (
                <p className="notice">Ephemeral in-browser keypair — won't persist across reloads.</p>
              )}
            </>
          )}
      </section>

      {wallet && (
        <section className="card">
          <label>Increment amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
          />
          <div className="chips">
            {QUICK_AMOUNTS.map((q) => (
              <button
                key={q}
                className={`chip ${amount === String(q) ? "active" : ""}`}
                onClick={() => setAmount(String(q))}
              >
                +{q}
              </button>
            ))}
          </div>
          <button onClick={increment} disabled={busy || !amount}>
            {busy && <span className="spinner" />}
            {busy ? "Submitting…" : "Submit gasless increment"}
          </button>
          {status && (
            <p className={`status status-${statusKind}`}>
              {status}
              {statusKind === "success" && lastSig && (
                <>
                  {" · "}
                  <a className="txlink" href={explorerTxUrl(lastSig)} target="_blank" rel="noreferrer">
                    {shortAddr(lastSig)}
                  </a>
                </>
              )}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Leaderboard <small>(from the node, GET /api/counters)</small></h2>
        {rows.length === 0
          ? <p className="muted">No counters yet — submit one above.</p>
          : (
            <ol className="board">
              {rows.map((r, i) => (
                <li key={r.authority} className={wallet?.publicKey.toBase58() === r.authority ? "me" : ""}>
                  <span className="rank">#{i + 1}</span>
                  <code>{r.authority.slice(0, 8)}…</code>
                  <strong className="value">{r.value}</strong>
                  <span className="slot">slot {r.slot}</span>
                </li>
              ))}
            </ol>
          )}
      </section>

      <section className="card">
        <h2>Incremental logs <small>(from the node, GET /api/counter-events)</small></h2>
        <p className="agg">
          {incs.length} increment{incs.length === 1 ? "" : "s"} · +{totalDelta.toLocaleString("en-US")}
        </p>
        {events.length === 0
          ? <p className="muted">No events yet.</p>
          : (
            <ul className="memos log">
              {events.map((e) => {
                const k = eventKey(e);
                const isReset = e.kind === "reset";
                const seen = seenRef.current.get(k);
                return (
                  <li key={k} className={newKeys.has(k) ? "new" : ""} title={`slot ${e.slot}`}>
                    <span className={`kind ${isReset ? "kind-reset" : "kind-inc"}`}>
                      {isReset ? "reset" : `+${e.delta}`}
                    </span>
                    <code>{shortAddr(e.authority)}</code>
                    <span className="tag">= {e.value}</span>
                    <span className="slot">{seen ? timeAgo(seen) : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </main>
  );
}
