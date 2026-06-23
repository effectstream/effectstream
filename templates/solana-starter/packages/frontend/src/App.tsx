import { useEffect, useState } from "react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";

// ── Stack endpoints (the running `bun run dev` dev stack) ───────────────────
const RPC = "http://localhost:8899";
const BATCHER_URL = "http://localhost:3334/send-input";
// The node's open read endpoints are gated by a dev API key (default value;
// override API_KEY_OPEN_ENDPOINTS_EXPLORER + this for production).
const EXPLORER_KEY = "effectstream_api_explorer_endpoints_password";
const NODE_MEMOS_URL =
  `http://localhost:9999/tables/solana_memos?limit=20&apiKey=${EXPLORER_KEY}`;

// The batcher's deterministic dev sponsor (fee payer) + the program it sponsors.
const SPONSOR = new PublicKey("J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf");
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ADDRESS_TYPE_SOLANA = 9; // AddressType.SOLANA

type Wallet = {
  kind: "phantom" | "dev";
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

type MemoRow = { slot: number; program_id: string; log_messages: unknown };

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      publicKey?: { toBase58(): string };
      connect: () => Promise<{ publicKey: { toBase58(): string } }>;
      signTransaction: (tx: Transaction) => Promise<Transaction>;
    };
  }
}

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [memo, setMemo] = useState("gm from a gasless wallet");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<MemoRow[]>([]);

  // Poll the node's public table for synced memos.
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch(NODE_MEMOS_URL);
        if (!res.ok) return;
        const json = await res.json();
        setRows((json.data ?? []).reverse());
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
      setStatus("Connected Phantom.");
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
      setStatus("No Phantom found — using an in-browser dev keypair.");
    }
  }

  async function submit() {
    if (!wallet) return;
    setBusy(true);
    setStatus("Building + signing the memo (you pay 0 SOL)…");
    try {
      const connection = new Connection(RPC, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");

      // Memo tx: fee payer is the sponsor; the user is a signer of the memo.
      const tx = new Transaction();
      tx.feePayer = SPONSOR;
      tx.recentBlockhash = blockhash;
      tx.add(new TransactionInstruction({
        keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(memo, "utf8"),
      }));

      const signed = await wallet.signTransaction(tx);
      const base64 = signed.serialize({ requireAllSignatures: false }).toString("base64");
      const userSig = signed.signatures.find(
        (s) => s.publicKey.equals(wallet.publicKey),
      )?.signature;

      setStatus("Sending to the batcher (sponsor co-signs + pays gas)…");
      const res = await fetch(BATCHER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            address: wallet.publicKey.toBase58(),
            addressType: ADDRESS_TYPE_SOLANA,
            input: base64,
            signature: userSig ? bs58.encode(userSig) : "",
            timestamp: Date.now().toString(),
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Batcher rejected: ${body.message ?? res.status}`);
      } else {
        setStatus(`✅ Sponsored on-chain — you paid 0 SOL. tx ${body.transactionHash ?? "(submitted)"}`);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>Solana Starter — gasless memo</h1>
      <p className="sub">
        Connect a wallet, write a memo, and submit it <b>without holding any SOL</b>.
        The fee-payer batcher co-signs and pays the gas; the sync node indexes it.
      </p>

      <section className="card">
        {!wallet
          ? <button onClick={connect}>Connect wallet</button>
          : (
            <div className="row">
              <span className="tag">{wallet.kind === "phantom" ? "Phantom" : "dev key"}</span>
              <code>{wallet.publicKey.toBase58()}</code>
            </div>
          )}
      </section>

      {wallet && (
        <section className="card">
          <label>Memo</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
          <button onClick={submit} disabled={busy || !memo}>
            {busy ? "Submitting…" : "Submit gasless memo"}
          </button>
          {status && <p className="status">{status}</p>}
        </section>
      )}

      <section className="card">
        <h2>Synced memos <small>(from the node, GET /tables/solana_memos)</small></h2>
        {rows.length === 0
          ? <p className="muted">None yet — submit one above.</p>
          : (
            <ul className="memos">
              {rows.map((r, i) => (
                <li key={i}>
                  <span className="slot">slot {r.slot}</span>
                  <code>{JSON.stringify(r.log_messages)}</code>
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}
