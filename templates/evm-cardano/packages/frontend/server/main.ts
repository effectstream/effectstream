import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { Lucid, type LucidEvolution } from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import { generateSeedPhrase, PROTOCOL_PARAMETERS_DEFAULT } from "@lucid-evolution/utils";

const PORT = 10599;
const API_UPSTREAM = process.env.VITE_API_URL || "http://localhost:9999";
const YACI_UPSTREAM = process.env.YACI_URL || "http://localhost:10000";
const DOLOS_BLOCKFROST_URL = "http://localhost:3000";

const server = Fastify();

let lucidInstance: LucidEvolution | null = null;
let walletAddress: string | null = null;

async function createWallet(): Promise<{ lucid: LucidEvolution; address: string }> {
  const provider = new Blockfrost(DOLOS_BLOCKFROST_URL, "dev");
  provider.evaluateTx = async () => {
    return [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }];
  };
  provider.submitTx = async (tx: string): Promise<string> => {
    const res = await fetch(`${YACI_UPSTREAM}/local-cluster/api/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: Buffer.from(tx, "hex"),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YACI tx submit failed (${res.status}): ${text}`);
    }
    const result = await res.text();
    return result.replace(/^"|"$/g, "");
  };
  const lucid = await Lucid(provider, "Custom", {
    presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
  });
  const seed = generateSeedPhrase();
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  return { lucid, address };
}

server.addContentTypeParser(
  "application/cbor",
  { parseAs: "buffer" },
  (_req, body, done) => {
    done(null, body);
  },
);

server.post("/cardano/connect", async (_request, reply) => {
  try {
    if (lucidInstance && walletAddress) {
      reply.send({ address: walletAddress, balance_lovelace: "0" });
      return;
    }
    const wallet = await createWallet();
    lucidInstance = wallet.lucid;
    walletAddress = wallet.address;
    reply.send({ address: walletAddress, balance_lovelace: "0" });
  } catch (e: any) {
    reply.status(500).send({ error: e.message });
  }
});

server.post("/cardano/faucet", async (request, reply) => {
  try {
    if (!walletAddress) throw new Error("Wallet not connected");
    const { amount = 1000 } = (request.body || {}) as { amount?: number };
    const res = await fetch(`${YACI_UPSTREAM}/local-cluster/api/addresses/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress, adaAmount: amount }),
    });
    if (!res.ok) throw new Error(`Faucet failed (${res.status})`);
    const data = await res.json();
    reply.send({ txHash: data.txHash || "faucet-tx", address: walletAddress, amount });
  } catch (e: any) {
    reply.status(500).send({ error: e.message });
  }
});

server.post("/cardano/send", async (request, reply) => {
  try {
    if (!lucidInstance) throw new Error("Wallet not connected");
    const { to, amount } = (request.body || {}) as { to: string; amount: number };
    if (!to || !amount) throw new Error("Missing 'to' or 'amount'");
    const tx = await lucidInstance
      .newTx()
      .pay.ToAddress(to, { lovelace: BigInt(amount) * 1_000_000n })
      .complete();
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    reply.send({ txHash });
  } catch (e: any) {
    reply.status(500).send({ error: e.message });
  }
});

server.all("/api/*", async (request, reply) => {
  const url = `${API_UPSTREAM}${request.url}`;
  const hasBody =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body != null;
  const res = await fetch(url, {
    method: request.method,
    headers: hasBody ? { "content-type": "application/json" } : {},
    body: hasBody ? JSON.stringify(request.body) : undefined,
  });
  reply.code(res.status);
  for (const [k, v] of res.headers) {
    if (k !== "transfer-encoding") reply.header(k, v);
  }
  return reply.send(res.body);
});

server.all("/yaci/*", async (request, reply) => {
  const yaciPath = request.url.replace(/^\/yaci/, "/local-cluster/api");
  const url = `${YACI_UPSTREAM}${yaciPath}`;
  const hasBody =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body != null;
  const isCbor = request.headers["content-type"]?.includes("cbor");
  const res = await fetch(url, {
    method: request.method,
    headers: hasBody
      ? { "content-type": request.headers["content-type"] || "application/json" }
      : {},
    body: hasBody
      ? isCbor
        ? (request.body as Buffer)
        : JSON.stringify(request.body)
      : undefined,
  });
  reply.code(res.status);
  for (const [k, v] of res.headers) {
    if (k !== "transfer-encoding") reply.header(k, v);
  }
  return reply.send(res.body);
});

server.register(fastifyStatic, {
  root: path.join(process.cwd(), "client", "dist"),
  prefix: "/",
});

server.setNotFoundHandler(async (_request, reply) => {
  return reply.sendFile("index.html");
});

if (import.meta.main) {
  server.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening on ${address}`);
  });
}
