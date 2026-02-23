import { dirname, resolve } from "@std/path";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  type ContractProviders,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  buildWalletAndWaitForFunds,
  configureMidnightNodeProviders,
  midnightNetworkConfig,
  readMidnightContract,
} from "@paimaexample/midnight-contracts";
import { OfferFilesContract } from "./contract-offer-files/src/index.ts";
import { witnesses } from "./contract-offer-files/src/witnesses.ts";
import {
  Transaction,
  UnprovenTransaction,
  ZswapChainState,
} from "@midnight-ntwrk/ledger-v7";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import * as bip39 from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { Buffer } from "node:buffer";
import type { WalletResult } from "@paimaexample/midnight-contracts";
import axios from "axios";
import type { StoredOffer, TokenEntry } from "./types.ts";
import { parseOffer } from "./parse-offer.ts";

// --- Storage Backend Configuration ---
type StorageBackend = "FILESYSTEM" | "CELESTIA_DA";
const STORAGE_BACKEND: StorageBackend =
  (Deno.env.get("STORAGE_BACKEND") as StorageBackend) || "FILESYSTEM";

// --- Celestia Configuration ---
const CELESTIA_NODE_URL = Deno.env.get("CELESTIA_NODE_URL") ||
  "http://localhost:26658";
const CELESTIA_NAMESPACE_HEX = Deno.env.get("CELESTIA_NAMESPACE_HEX") ||
  "000000000000deadbeef";
const CELESTIA_POLL_INTERVAL = parseInt(
  Deno.env.get("CELESTIA_POLL_INTERVAL") || "1000",
);
const CELESTIA_FEE = parseInt(Deno.env.get("CELESTIA_FEE") || "2000");
const CELESTIA_GAS_LIMIT = parseInt(
  Deno.env.get("CELESTIA_GAS_LIMIT") || "100000",
);

// Monkey-patch to handle tryApply errors gracefully
const origTryApply = ZswapChainState.prototype.tryApply;
ZswapChainState.prototype.tryApply = function (...args) {
  try {
    return origTryApply.apply(this, args);
  } catch {
    return [this, new Map()];
  }
};

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));
const dbDir = resolve(currentDir, "..", "database");
const tokensDir = resolve(dbDir, "tokens");
const offersDir = resolve(dbDir, "offers");

if (STORAGE_BACKEND === "FILESYSTEM") {
  Deno.mkdirSync(tokensDir, { recursive: true });
  Deno.mkdirSync(offersDir, { recursive: true });
}

// --- Celestia DA Helpers ---

function celestiaNamespaceBase64(hex: string): string {
  const cleanHex = hex.replace(/^0x/, "");
  const buffer = Buffer.alloc(29); // 1 byte version (0) + 28 bytes ID
  const hexBuffer = Buffer.from(cleanHex, "hex");
  hexBuffer.copy(buffer, 29 - hexBuffer.length);
  return buffer.toString("base64");
}

const CELESTIA_NAMESPACE_B64 = celestiaNamespaceBase64(CELESTIA_NAMESPACE_HEX);

async function celestiaRpc(method: string, params: unknown[]) {
  try {
    const res = await axios.post(
      CELESTIA_NODE_URL,
      { jsonrpc: "2.0", id: 1, method, params },
      { headers: { "Content-Type": "application/json" } },
    );
    if (res.data.error) throw res.data.error;
    return res.data.result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("blob: not found")) return null;
    console.error(`Celestia RPC Error [${method}]:`, msg);
    return null;
  }
}

async function celestiaSubmitBlob(
  data: string,
): Promise<{ txhash: string; height: string } | null> {
  const b64Data = Buffer.from(data).toString("base64");
  const response = await celestiaRpc(
    /*"state.SubmitPayForBlob",*/ "blob.Submit",
    [
      [{ namespace: CELESTIA_NAMESPACE_B64, data: b64Data, share_version: 0 }],
      { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT },
    ],
  );
  return response;
}

// In-memory cache of data loaded from Celestia blobs
const celestiaTokensCache: Record<string, unknown>[] = [];
const celestiaOffersCache: Record<string, unknown>[] = [];
let celestiaNextOfferId = 1;

async function celestiaCheckBlockForBlobs(height: number) {
  const blobs = await celestiaRpc("blob.GetAll", [height, [
    CELESTIA_NAMESPACE_B64,
  ]]);
  if (!blobs || blobs.length === 0) return;

  console.log(`Celestia: found ${blobs.length} blob(s) at height ${height}`);
  for (const blob of blobs) {
    const decoded = Buffer.from(blob.data, "base64").toString("utf-8");
    try {
      const parsed = JSON.parse(decoded);
      if (parsed._kind === "token") {
        const exists = celestiaTokensCache.some((t) => t.type === parsed.type);
        if (!exists) celestiaTokensCache.push(parsed);
      } else if (parsed._kind === "offer") {
        const exists = celestiaOffersCache.some((o) => o.id === parsed.id);
        if (!exists) {
          celestiaOffersCache.push(parsed);
          if (
            typeof parsed.id === "number" && parsed.id >= celestiaNextOfferId
          ) {
            celestiaNextOfferId = parsed.id + 1;
          }
        }
      }
    } catch {
      // Non-JSON blob, skip
    }
  }
}

function startCelestiaMonitor() {
  console.log(
    `Celestia monitor: polling ${CELESTIA_NODE_URL} every ${CELESTIA_POLL_INTERVAL}ms`,
  );
  console.log(`Celestia namespace: ${CELESTIA_NAMESPACE_HEX}`);

  let lastHeight = 0;

  (async () => {
    const head = await celestiaRpc("header.LocalHead", []);
    if (head) lastHeight = parseInt(head.header.height);

    setInterval(async () => {
      const currentHead = await celestiaRpc("header.LocalHead", []);
      if (!currentHead) return;
      const currentHeight = parseInt(currentHead.header.height);
      if (currentHeight > lastHeight) {
        await celestiaCheckBlockForBlobs(currentHeight);
        lastHeight = currentHeight;
      }
    }, CELESTIA_POLL_INTERVAL);
  })();
}

const mnemonicToSeed = async (mnemonic: string): Promise<Buffer> => {
  const words = mnemonic.trim().split(/\s+/);
  if (!bip39.validateMnemonic(words.join(" "), english)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const seed = await bip39.mnemonicToSeed(words.join(" "));
  return Buffer.from(seed);
};

// --- Database helpers (dispatch by STORAGE_BACKEND) ---

async function saveToken(
  tokenType: string,
  value: string,
  tokenKind: "shielded" | "unshielded" = "shielded",
) {
  const data: Record<string, unknown> = {
    type: tokenType,
    value,
    tokenKind,
    mintedAt: new Date().toISOString(),
  };

  if (STORAGE_BACKEND === "CELESTIA_DA") {
    data._kind = "token";
    const result = await celestiaSubmitBlob(JSON.stringify(data));
    if (result) {
      console.log(
        `Celestia: token saved, tx=${result.txhash}, height=${result.height}`,
      );
    }
    celestiaTokensCache.push(data);
  } else {
    Deno.writeTextFileSync(
      resolve(tokensDir, `${tokenType}.json`),
      JSON.stringify(data, null, 2),
    );
  }
  return data;
}

function loadTokens() {
  if (STORAGE_BACKEND === "CELESTIA_DA") {
    return celestiaTokensCache;
  }
  const tokens: Record<string, unknown>[] = [];
  try {
    for (const entry of Deno.readDirSync(tokensDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        tokens.push(
          JSON.parse(Deno.readTextFileSync(resolve(tokensDir, entry.name))),
        );
      }
    }
  } catch { /* empty dir */ }
  return tokens;
}

function nextOfferId(): number {
  if (STORAGE_BACKEND === "CELESTIA_DA") {
    return celestiaNextOfferId;
  }
  let max = 0;
  try {
    for (const entry of Deno.readDirSync(offersDir)) {
      if (entry.isFile && entry.name.startsWith("offer-")) {
        const id = parseInt(
          entry.name.replace("offer-", "").replace(".json", ""),
        );
        if (id > max) max = id;
      }
    }
  } catch { /* empty dir */ }
  return max + 1;
}

async function saveOffer(offer: Record<string, unknown>) {
  if (STORAGE_BACKEND === "CELESTIA_DA") {
    const data = { ...offer, _kind: "offer" };
    const result = await celestiaSubmitBlob(JSON.stringify(data));
    if (result) {
      console.log(
        `Celestia: offer saved, tx=${result.txhash}, height=${result.height}`,
      );
    }
    const exists = celestiaOffersCache.some((o) => o.id === offer.id);
    if (!exists) celestiaOffersCache.push(offer);
    else {
      const idx = celestiaOffersCache.findIndex((o) => o.id === offer.id);
      celestiaOffersCache[idx] = offer;
    }
    if (typeof offer.id === "number" && offer.id >= celestiaNextOfferId) {
      celestiaNextOfferId = offer.id + 1;
    }
  } else {
    Deno.writeTextFileSync(
      resolve(offersDir, `offer-${offer.id}.json`),
      JSON.stringify(offer, null, 2),
    );
  }
  return offer;
}

function loadOffers() {
  if (STORAGE_BACKEND === "CELESTIA_DA") {
    return [...celestiaOffersCache].sort((a, b) =>
      (a.id as number) - (b.id as number)
    );
  }
  const offers: Record<string, unknown>[] = [];
  try {
    for (const entry of Deno.readDirSync(offersDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        offers.push(
          JSON.parse(Deno.readTextFileSync(resolve(offersDir, entry.name))),
        );
      }
    }
  } catch { /* empty dir */ }
  return offers.sort((a, b) => (a.id as number) - (b.id as number));
}

// --- Lazy Wallet & Contract Initialization ---

let _wallet1Result: WalletResult | null = null;
let _wallet1Bech32: string | null = null;
let _wallet1Promise: Promise<WalletResult> | null = null;

async function getWallet1(force = false): Promise<{ result: WalletResult; bech32: string }> {
  if (_wallet1Result && _wallet1Bech32 && !force) {
    return { result: _wallet1Result, bech32: _wallet1Bech32 };
  }
  if (!_wallet1Promise) {
    _wallet1Promise = (async () => {
      console.log("Initializing wallet 1...");
      const result = await buildWalletAndWaitForFunds(
        midnightNetworkConfig,
        midnightNetworkConfig.walletSeed,
        midnightNetworkConfig.id,
      );
      const addr = await result.wallet.shielded.getAddress();
      _wallet1Bech32 = MidnightBech32m.encode(midnightNetworkConfig.id, addr)
        .asString();
      _wallet1Result = result;
      console.log("Wallet 1 ready:", _wallet1Bech32);
      return result;
    })();
  }
  await _wallet1Promise;
  return { result: _wallet1Result!, bech32: _wallet1Bech32! };
}

let _wallet2Result: WalletResult | null = null;
let _wallet2Bech32: string | null = null;
let _wallet2Promise: Promise<WalletResult> | null = null;

async function getWallet2(): Promise<{ result: WalletResult; bech32: string }> {
  if (_wallet2Result && _wallet2Bech32) {
    return { result: _wallet2Result, bech32: _wallet2Bech32 };
  }
  if (!_wallet2Promise) {
    _wallet2Promise = (async () => {
      console.log("Initializing wallet 2...");
      const mnemonic =
        (await Deno.readTextFile(resolve(currentDir, "..", "mnen.txt"))).trim();
      const seed = (await mnemonicToSeed(mnemonic)).toString("hex");
      const result = await buildWalletAndWaitForFunds(
        midnightNetworkConfig,
        seed,
        midnightNetworkConfig.id,
      );
      const addr = await result.wallet.shielded.getAddress();
      _wallet2Bech32 = MidnightBech32m.encode(midnightNetworkConfig.id, addr)
        .asString();
      _wallet2Result = result;
      console.log("Wallet 2 ready:", _wallet2Bech32);
      return result;
    })();
  }
  await _wallet2Promise;
  return { result: _wallet2Result!, bech32: _wallet2Bech32! };
}

// deno-lint-ignore no-explicit-any
let _contract: any = null;
// deno-lint-ignore no-explicit-any
let _contractPromise: Promise<any> | null = null;

async function getContract(walletResult: WalletResult | null = null) {
  if (_contract) return _contract;
  if (!_contractPromise) {
    _contractPromise = (async () => {
      if (!walletResult) {
        const { result: wallet1Result } = await getWallet1();
        walletResult = wallet1Result;
      }
      const contractConfig = {
        privateStateStoreName: "offerFilesPrivateState",
        zkConfigPath: resolve(
          currentDir,
          "contract-offer-files",
          "src",
          "managed",
        ),
      };

      const contractAddress = readMidnightContract("contract-offer-files", {
        networkId: midnightNetworkConfig.id,
        baseDir: currentDir,
      }).contractAddress;

      const MyCompiledContract = CompiledContract.make(
        "contract-offer-files",
        OfferFilesContract.Contract,
      ).pipe(
        CompiledContract.withWitnesses(witnesses),
        CompiledContract.withCompiledFileAssets("./"),
      );

      const providers = configureMidnightNodeProviders(
        walletResult.wallet,
        walletResult.zswapSecretKeys,
        walletResult.walletZswapSecretKeys,
        walletResult.dustSecretKey,
        walletResult.walletDustSecretKey,
        midnightNetworkConfig,
        contractConfig.privateStateStoreName,
        contractConfig.zkConfigPath,
        walletResult.unshieldedKeystore,
      );

      const contract = await findDeployedContract<OfferFilesContract.Contract>(
        providers as ContractProviders<
          OfferFilesContract.Contract,
          "mintx",
          unknown
        >,
        {
          contractAddress,
          compiledContract: MyCompiledContract,
          privateStateId: "offerFilesPrivateState",
          initialPrivateState: {},
        },
      );

      console.log("Contract joined successfully");
      _contract = contract;
      return contract;
    })();
  }
  return await _contractPromise;
}

// --- Helper: JSON response ---

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorJson(message: string, status = 500) {
  return json({ error: message }, status);
}

// --- HTTP Server ---

const publicDir = resolve(currentDir, "public");

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Serve static frontend
    if (path === "/" || path === "/index.html") {
      const html = await Deno.readTextFile(resolve(publicDir, "index.html"));
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // --- Balance endpoints ---
    if (path === "/api/balance/wallet1" && req.method === "GET") {
      const { result, bech32 } = await getWallet1();
      const state = await result.wallet.waitForSyncedState();
      return json({
        address: bech32,
        balances: serializeBalances(state.shielded.balances),
      });
    }

    if (path === "/api/balance/wallet2" && req.method === "GET") {
      const { result, bech32 } = await getWallet2();
      const state = await result.wallet.waitForSyncedState();
      return json({
        address: bech32,
        balances: serializeBalances(state.shielded.balances),
      });
    }

    // --- Mint ---
    if (path === "/api/mint" && req.method === "POST") {
      console.log('Step 0: Getting contract');
      const offerFilesContract = await getContract();

      console.log('Step 1: Minting tokens');
      const MINT_AMOUNT = 1_000_000n;
      const DOMAIN_SEPARATOR = new Uint8Array(32).fill(1);
      const NONCE = BigInt(Math.floor(Math.random() * 10000000000));
      console.log('Step 2: Calling mintx contract');
      const finalizedTxData = await offerFilesContract.callTx.mintx(
        DOMAIN_SEPARATOR,
        MINT_AMOUNT,
        NONCE,
      );
      console.log('Step 3: Getting coins');
      const coins = finalizedTxData.private.newCoins;
      const results = await Promise.all(
        coins.map((c: { type: string; value: bigint }) =>
          saveToken(c.type, c.value.toString(), "shielded")
        ),
      );
      console.log('Step 4: Saving coins');
      return json({ success: true, coins: results });
    }

    // --- Mint Unshielded ---
    if (path === "/api/mint-unshielded" && req.method === "POST") {
      const { result: wallet2Result } = await getWallet2();
      const body = await req.json().catch(() => ({}));
      const amount = 100n; // BigInt(body.amount ?? 100);

      console.log("Step 0: Getting contract (mint-unshielded)");
      const offerFilesContract = await getContract(wallet2Result);

      // Use a random domain separator so each mint produces a unique token type
      // const DOMAIN_SEPARATOR = crypto.getRandomValues(new Uint8Array(32));
      const DOMAIN_SEPARATOR = new Uint8Array(32).fill(1);

      console.log("Step 1: Calling mintUnshieldedToSelfAndReceiveTest");
      const finalizedTxData = await offerFilesContract.callTx
        .mintUnshieldedToSelfAndReceiveTest(DOMAIN_SEPARATOR, amount);

      // The circuit returns Bytes<32> (the color) — accessible via private.result
      const color: Uint8Array = finalizedTxData.private.result;
      const colorHex = Buffer.from(color).toString("hex");

      console.log("Step 2: Saving unshielded token", colorHex);
      const tokenRecord = await saveToken(
        colorHex,
        amount.toString(),
        "unshielded",
      );

      return json({ success: true, token: tokenRecord });
    }

    // --- Transfer ---
    if (path === "/api/transfer" && req.method === "POST") {
      const { result: wallet1Result } = await getWallet1();
      const body = await req.json();
      const { tokenType, amount, receiverAddress } = body;
      if (!tokenType || !amount || !receiverAddress) {
        return errorJson("Missing tokenType, amount, or receiverAddress", 400);
      }

      const recipe = await wallet1Result.wallet.transferTransaction(
        [{
          type: "shielded",
          outputs: [{
            type: tokenType,
            amount: BigInt(amount),
            receiverAddress,
          }],
        }],
        {
          shieldedSecretKeys: wallet1Result.zswapSecretKeys,
          dustSecretKey: wallet1Result.dustSecretKey,
        },
        { ttl: new Date(Date.now() + 1000 * 60 * 60) },
      );

      const signedTx: UnprovenTransaction = await wallet1Result.wallet
        .signUnprovenTransaction(
          recipe.transaction,
          (payload: Uint8Array) =>
            wallet1Result.unshieldedKeystore.signData(payload),
        );
      const finalizedTx = await wallet1Result.wallet.finalizeTransaction(
        signedTx,
      );
      const txId = await wallet1Result.wallet.submitTransaction(finalizedTx);

      return json({ success: true, txId });
    }

    // --- Create ZSwap Offer (wallet 1) ---
    if (path === "/api/zswap/create" && req.method === "POST") {
      const { result: wallet1Result, bech32: wallet1Bech32 } =
        await getWallet1();
      const body = await req.json();
      const { gives, wants } = body as {
        gives: TokenEntry[];
        wants: TokenEntry[];
      };
      if (!gives?.length || !wants?.length) {
        return errorJson("Missing or empty gives/wants arrays", 400);
      }

      // Build inputs from gives array
      const shieldedInputs: Record<string, bigint> = {};
      const unshieldedInputs: Record<string, bigint> = {};
      for (const entry of gives) {
        if (entry.type === "shielded") {
          shieldedInputs[entry.token] = BigInt(entry.amount);
        } else {
          unshieldedInputs[entry.token] = BigInt(entry.amount);
        }
      }

      const inputMap: Record<string, Record<string, bigint>> = {};
      if (Object.keys(shieldedInputs).length > 0) {
        inputMap.shielded = shieldedInputs;
      }
      if (Object.keys(unshieldedInputs).length > 0) {
        inputMap.unshielded = unshieldedInputs;
      }

      // Build outputs from wants array
      const outputs = wants.map((entry) => ({
        type: entry.type,
        outputs: [{
          type: entry.token,
          amount: BigInt(entry.amount),
          receiverAddress: wallet1Bech32,
        }],
      }));

      const offerRecipe = await wallet1Result.wallet.initSwap(
        inputMap,
        outputs,
        {
          shieldedSecretKeys: wallet1Result.zswapSecretKeys,
          dustSecretKey: wallet1Result.dustSecretKey,
        },
        { ttl: new Date(Date.now() + 1000 * 60 * 60) },
      );

      const serializedOffer = offerRecipe.transaction.serialize().toBase64();
      const id = nextOfferId();
      const offer: StoredOffer = {
        id,
        version: 1,
        transaction: serializedOffer,
        gives,
        wants,
        status: "pending",
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };
      await saveOffer(offer);

      return json({ success: true, offer });
    }

    // --- Accept ZSwap Offer (wallet 2) ---
    if (path === "/api/zswap/accept" && req.method === "POST") {
      const { result: wallet2Result } = await getWallet2();
      const body = await req.json();
      const { offerId } = body;
      if (!offerId) return errorJson("Missing offerId", 400);

      let offerData: Record<string, unknown>;
      if (STORAGE_BACKEND === "CELESTIA_DA") {
        const found = celestiaOffersCache.find((o) => o.id === offerId);
        if (!found) return errorJson("Offer not found", 404);
        offerData = { ...found };
      } else {
        const offerPath = resolve(offersDir, `offer-${offerId}.json`);
        try {
          offerData = JSON.parse(await Deno.readTextFile(offerPath));
        } catch {
          return errorJson("Offer not found", 404);
        }
      }

      const base64Str =
        (offerData.transaction ?? offerData.serializedOffer) as string;
      const raw = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
      const offerTx = Transaction.deserialize(
        "signature" as const,
        "pre-proof" as const,
        "pre-binding" as const,
        raw,
      ) as UnprovenTransaction;

      const balancedRecipe = await wallet2Result.wallet
        .balanceUnprovenTransaction(
          offerTx,
          {
            shieldedSecretKeys: wallet2Result.zswapSecretKeys,
            dustSecretKey: wallet2Result.dustSecretKey,
          },
          { ttl: new Date(Date.now() + 1000 * 60 * 60) },
        );

      const signedTx: UnprovenTransaction = await wallet2Result.wallet
        .signUnprovenTransaction(
          balancedRecipe.transaction,
          (payload: Uint8Array) =>
            wallet2Result.unshieldedKeystore.signData(payload),
        );

      const finalizedTx = await wallet2Result.wallet.finalizeTransaction(
        signedTx,
      );
      const txId = await wallet2Result.wallet.submitTransaction(finalizedTx);

      offerData.status = "accepted";
      await saveOffer(offerData);

      return json({ success: true, txId });
    }

    // --- List tokens ---
    if (path === "/api/tokens" && req.method === "GET") {
      return json(loadTokens());
    }

    // --- List offers ---
    if (path === "/api/offers" && req.method === "GET") {
      const offers = loadOffers();
      const parsed = offers.map((offer) => {
        try {
          return parseOffer(offer);
        } catch {
          return { ...offer, parseError: "Failed to parse transaction" };
        }
      });
      return json(parsed);
    }

    return new Response("Not Found", { status: 404 });
  } catch (err) {
    console.error("Request error:", err);
    return errorJson(err instanceof Error ? err.message : String(err));
  }
});

console.log(
  `Server running on http://localhost:8000 [storage: ${STORAGE_BACKEND}]`,
);

if (STORAGE_BACKEND === "CELESTIA_DA") {
  startCelestiaMonitor();
}

// --- Utilities ---

function serializeBalances(
  balances: Record<string, bigint>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [type, value] of Object.entries(balances)) {
    result[type] = value.toString();
  }
  return result;
}
