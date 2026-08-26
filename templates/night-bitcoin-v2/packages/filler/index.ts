// Load wasm before other Midnight SDK code (matches frontend / node entrypoints).
import "@midnightntwrk/onchain-runtime-v4";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

// Configure network ID on the same module instance midnight-js-contracts uses.
// Without this, callTx throws when batcher-sdk's adapter set it on a duplicate copy.
setNetworkId(midnightNetworkConfig.id as never);

// Per-filler service: HTTP API for quotes + cross-chain payment notification.
//
// Each filler is a separate orchestrator process with its own port + wallet
// indexes. The orchestrator launches multiple instances (Alpha Liquidity,
// Omega Swap, Quantum Pools) — see `start.dev.ts` and `fillerDefinitions`.
//
// argv layout (from orchestrator):
//   [name, fillerPort, bitcoinWalletPath, midnightWalletPath]
//
// This file also constructs an embedded batcher per filler. The embedded
// batcher is event-driven (no HTTP server) and is responsible for submitting
// outgoing fill TXs (Bitcoin payouts and Midnight ERC20 transfers).
// It is distinct from the central balancing batcher at port 3334 in
// `packages/batcher/` which handles the protocol's balancing/intent flow.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fastify from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { main, suspend, spawn, call } from "effection";
import {
  type BatcherConfig,
  BitcoinAdapter,
  buildBitcoinSignatureMessage,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  MidnightAdapter,
} from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { AddressType } from "@effectstream/utils";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

// Static per-template domain separator for the M20 unshielded token color.
// All mints share this color so the wallet shows a single "M20" balance.
const M20_DOMAIN_SEP = new Uint8Array(32).fill(0x20);
// Bitcoin signature dependencies
import * as bitcoin from "bitcoinjs-lib";
import * as bitcoinMessage from "bitcoinjs-message";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as bip32 from "bip32";
// Midnight address parsing
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

const ECPair = ecpair.ECPairFactory(tinysecp);
const BIP32 = bip32.BIP32Factory(tinysecp);
const NETWORK = bitcoin.networks.regtest;

// --- argv parsing ---

const args = process.argv.slice(2);
const FILLER_NAME = args[0];
const PORT = Number.parseInt(args[1] ?? "", 10);
const BITCOIN_WALLET_PATH = args[2];
const MIDNIGHT_WALLET_PATH = args[3];

if (
  !FILLER_NAME ||
  !PORT ||
  Number.isNaN(PORT) ||
  !BITCOIN_WALLET_PATH ||
  !MIDNIGHT_WALLET_PATH
) {
  console.error(
    "Usage: bun run index.ts <fillerName> <fillerPort> <bitcoinWalletPath> <midnightWalletPath>",
  );
  process.exit(1);
}

// --- Filler defaults (previously in batcher/config.ts) ---

const FILLER_BATCHER_DEFAULTS = {
  pollingInterval: 1000,
  storageRoot: "./batcher-data",
  bitcoin: {
    rpcUrl: "http://127.0.0.1:18443",
    walletName: "default",
    rpcUser: "dev",
    rpcPass: "devpassword",
  },
} as const;

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") ||
  "filler";

const namespace = slugify(FILLER_NAME);

// --- Load Bitcoin wallet ---

console.log(`Loading Bitcoin wallet from: ${BITCOIN_WALLET_PATH}`);
const bitcoinWalletData = JSON.parse(readFileSync(BITCOIN_WALLET_PATH, "utf-8"));
const seedHex = String(bitcoinWalletData.seed).replace("0x", "");
const bitcoinSeed = Buffer.from(seedHex, "hex");
const masterNode = BIP32.fromSeed(bitcoinSeed, NETWORK);
const derivedAccount = masterNode.derivePath(bitcoinWalletData.derivationPath);
const bitcoinKeyPair = ECPair.fromPrivateKey(
  Buffer.from(derivedAccount.privateKey!),
  { network: NETWORK },
);
const bitcoinAddress = bitcoin.payments.p2wpkh({
  pubkey: bitcoinKeyPair.publicKey,
  network: NETWORK,
}).address!;
const batcherWif = derivedAccount.toWIF();

console.log(`Loaded Bitcoin wallet: ${bitcoinAddress}`);

// --- Load Midnight wallet ---

console.log(`Loading Midnight wallet from: ${MIDNIGHT_WALLET_PATH}`);
const midnightWalletData = JSON.parse(
  readFileSync(MIDNIGHT_WALLET_PATH, "utf-8"),
);
const midnightSeed: string = midnightWalletData.seed;
const midnightUnshieldedAddress: string =
  midnightWalletData.unshieldedAddress ?? midnightWalletData.address;
if (!midnightUnshieldedAddress?.startsWith("mn_addr_")) {
  throw new Error(
    `Midnight wallet at ${MIDNIGHT_WALLET_PATH} is missing unshieldedAddress (mn_addr_…); re-run create-wallets`,
  );
}

console.log(
  `Loaded Midnight wallet (unshielded): ${midnightUnshieldedAddress}`,
);

// --- Embedded batcher setup ---

// Per-filler storage root, one directory per filler instance.
const storagePath = join(FILLER_BATCHER_DEFAULTS.storageRoot, namespace);
mkdirSync(storagePath, { recursive: true });

const bitcoinRpcUrl = FILLER_BATCHER_DEFAULTS.bitcoin.walletName
  ? `${FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl.replace(/\/$/, "")}/wallet/${FILLER_BATCHER_DEFAULTS.bitcoin.walletName}`
  : FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl;

const bitcoinAdapter = new BitcoinAdapter({
  rpcUrl: bitcoinRpcUrl,
  rpcUser: FILLER_BATCHER_DEFAULTS.bitcoin.rpcUser,
  rpcPass: FILLER_BATCHER_DEFAULTS.bitcoin.rpcPass,
  batcherWif,
  syncProtocolName: "parallelBitcoin",
});

const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract(
  "unshielded-erc20",
  { networkId: midnightNetworkConfig.id },
);

if (!contractAddress) {
  throw new Error(
    `Midnight contract address not found for unshielded-erc20 (networkId=${midnightNetworkConfig.id})`,
  );
}

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  midnightSeed,
  {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
    zkConfigPath,
    contractName: "unshielded-erc20",
    privateStateStoreName: `unshielded-erc20-${namespace}-private-state`,
    privateStateId: "unshielded_erc20State",
    contractJoinTimeoutSeconds: 600,
    walletFundingTimeoutSeconds: 600,
    walletNetworkId: midnightNetworkConfig.id,
  },
  // Pass the Contract *class* (not `new Contract(...)` instance) — the
  // adapter's `CompiledContract.make(name, contractClass)` call needs a
  // constructor it can `new` internally; an instance fails with
  // "Contract is not a constructor".
  SimpleToken.Contract,
  witnesses,
  contractInfo,
  "parallelMidnight",
);

const batcherConfig: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: FILLER_BATCHER_DEFAULTS.pollingInterval,
  namespace,
  confirmationLevel: "wait-effectstream-processed",
  // Embedded batcher: no HTTP server (we drive it from this process via
  // batchInput()). Old code used port 0 as a sentinel for the same.
  enableHttpServer: false,
  enableEventSystem: true,
  port: 0,
};

const storage = new FileStorage(storagePath);
const batcher = createNewBatcher(batcherConfig, storage);

// Pattern B — fluent adapter wiring.
batcher
  .addBlockchainAdapter("midnight", midnightAdapter, {
    criteriaType: "size",
    maxBatchSize: 1,
  })
  .addBlockchainAdapter("bitcoin", bitcoinAdapter, {
    criteriaType: "hybrid",
    timeWindowMs: 1000,
    maxBatchSize: 5,
  })
  .setDefaultTarget("midnight");

console.log(
  `Batcher configured for filler "${FILLER_NAME}" (namespace=${namespace}); ` +
    `bitcoin=${bitcoinAddress}, midnight contract=${contractAddress}`,
);

// --- Fastify HTTP server ---

const server = fastify();

const QuoteParamsSchema = Type.Object({
  orderId: Type.String(),
  fromToken: Type.String(),
  toToken: Type.String(),
  fromAmount: Type.Number(),
});

const QuoteResponseSchema = Type.Object({
  orderId: Type.String(),
  fromToken: Type.String(),
  filler: Type.String(),
  toToken: Type.String(),
  fromAmount: Type.Number(),
  toAmount: Type.Number(),
  fee: Type.Number(),
  /** Lace unshielded-send destination for M20 → filler payments */
  midnightUnshieldedAddress: Type.String(),
});

const NotifyPaymentSchema = Type.Object({
  orderId: Type.String(),
  toAddress: Type.String(),
  amount: Type.Number(),
  token: Type.String(),
  chainId: Type.String(),
});

const NotifyPaymentResponseSchema = Type.Object({
  status: Type.String(),
  orderId: Type.String(),
});

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const wrapInEither = (value: unknown) => ({
  is_left: true,
  left: value,
  right: { bytes: toHex(new Uint8Array(32).fill(0)) },
});

// Decode a bech32m unshielded address (`mn_addr_<network>1...`) to the
// 32-byte UserAddress hex string that `mint_unshielded` expects as its
// `recipient.bytes` argument.
//
// An unshielded address is simply bech32m(UserAddress_bytes) — 32 bytes.
// We must NOT decode it as a ShieldedAddress (which is a different, larger
// structure); doing so extracts coinPublicKey which is a different key type
// and would cause tokens to be minted to an unreachable address.
const extractPublicAddress = (unshieldedBech32m: string) => {
  const parsed = MidnightBech32m.parse(unshieldedBech32m);
  // `parsed.data` is the raw bech32m payload — for unshielded addresses that
  // is exactly the 32-byte UserAddress. Matches `userAddressBytes()` in
  // the frontend's interface.ts.
  return toHex(Uint8Array.prototype.slice.call(parsed.data, 0, 32));
};

const tokens = ["btc", "eth", "m20", "wbtc"];
const basePrices = [100000, 4000, 0.5, 100000];

const getConversion = (
  fromAmount: number,
  fromToken: string,
  toToken: string,
) => {
  const fromIndex = tokens.indexOf(fromToken);
  const toIndex = tokens.indexOf(toToken);
  if (fromIndex === -1 || toIndex === -1) {
    return 0;
  }
  const ratio = basePrices[fromIndex] / basePrices[toIndex];
  const randomPercent = Math.random() * 10 + 2; // [2, 12]
  const rate = ratio * (1 - randomPercent / 100);
  return rate * fromAmount;
};

server.get("/api/health", async (_request, reply) => {
  reply.send({ ok: true, filler: FILLER_NAME });
});

server.post<{
  Body: Static<typeof QuoteParamsSchema>;
  Reply: Static<typeof QuoteResponseSchema>;
}>("/api/quote", async (request, reply) => {
  const { orderId, fromToken, toToken, fromAmount } = request.body;

  const basisPoints = 10; // 0.01% * 10 = 0.1% => 10 basis points
  const conversionRate = getConversion(fromAmount, fromToken, toToken);
  const fee = (basisPoints * conversionRate) / 10000;

  const quote: Static<typeof QuoteResponseSchema> = {
    orderId,
    fromToken,
    filler: FILLER_NAME,
    toToken,
    fromAmount,
    toAmount: conversionRate - fee,
    fee,
    midnightUnshieldedAddress,
  };

  reply.send(quote);
});

server.post<{
  Body: Static<typeof NotifyPaymentSchema>;
  Reply: Static<typeof NotifyPaymentResponseSchema>;
}>("/api/notify-filler-intent-payment", async (request, reply) => {
  const { orderId, toAddress, amount, token } = request.body;
  console.log(
    `Notification received: order=${orderId} token=${token} amount=${amount} to=${toAddress} fillerWallet=${bitcoinAddress}`,
  );

  try {
    if (token === "btc") {
      const satoshis = Math.floor(amount);
      const timestamp = new Date().toISOString();

      const payload = {
        toAddress,
        amountSats: satoshis,
      };

      // Build the message to sign
      const message = buildBitcoinSignatureMessage(payload, timestamp);

      // Sign with Bitcoin private key
      const signature = bitcoinMessage
        .sign(message, bitcoinKeyPair.privateKey!, bitcoinKeyPair.compressed)
        .toString("base64");

      await batcher.batchInput(
        {
          address: bitcoinAddress,
          addressType: -1,
          input: JSON.stringify(payload),
          signature,
          timestamp,
          target: "bitcoin",
        },
        "wait-receipt",
      );
    } else if (token === "m20") {
      const timestamp = new Date().toISOString();
      const publicAddress = extractPublicAddress(toAddress);
      // Mint native unshielded M20 coins directly to the recipient. The
      // (contract address, M20_DOMAIN_SEP) pair fixes the token color so the
      // recipient sees one "M20" balance entry in their Lace wallet.
      // The batcher's midnight adapter validates each circuit arg:
      //   - Bytes<N>          → hex string
      //   - Uint<N>           → decimal-string BigInt (JSON has no BigInt)
      //   - UserAddress.bytes → hex string
      // `publicAddress` is already a hex string (extractPublicAddress returns
      // hex). M20_DOMAIN_SEP is a Uint8Array we encode here.
      const bytesToHex = (bytes: Uint8Array | number[]): string =>
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      await batcher.batchInput(
        {
          address: "filler-midnight",
          addressType: AddressType.MIDNIGHT,
          input: JSON.stringify(
            {
              circuit: "mint_unshielded",
              args: [
                bytesToHex(M20_DOMAIN_SEP),
                BigInt(amount),
                { bytes: publicAddress },
              ],
            },
            (_key, value) =>
              typeof value === "bigint" ? value.toString() : value,
          ),
          signature: "0x",
          timestamp,
          target: "midnight",
        },
        "no-wait",
      );
    } else {
      console.warn(
        `Unknown token "${token}" for order ${orderId}; ignoring`,
      );
    }
  } catch (e) {
    console.error("Error executing payment:", e);
    reply.status(500).send({ status: "error", orderId });
    return;
  }

  reply.send({ status: "processing", orderId });
});

batcher.addStateTransition("error", (input) => {
  console.error("------ batcher error ------");
  console.error("Error executing payment:", input);
  console.error("---------------------------");
});

batcher.addStateTransition("batch:submit", (input) => {
  console.log("------ batch submitted ------");
  console.log(input);
  console.log("-----------------------------");
});

// --- Main execution ---

main(function* () {
  console.log(`Starting Filler "${FILLER_NAME}" service on port ${PORT}`);

  // Initialize batcher synchronously - fail fast if wallet not ready.
  try {
    console.log(
      "Initializing batcher (waiting for Midnight wallet sync & funds)...",
    );
    // We drive polling via runPollingLoop() below; skip init's setInterval
    // to avoid two polling systems racing and submitting duplicate txs.
    yield* call(() => batcher.init({ startPolling: false }));
    console.log("Batcher initialized and ready");
  } catch (error) {
    console.error("Batcher initialization failed:", error);
    console.error(
      "Ensure the Midnight wallet is funded before starting the filler",
    );
    process.exit(1);
  }

  // Start batcher polling loop (batcher is already initialized).
  yield* spawn(function* () {
    try {
      yield* batcher.runPollingLoop();
    } catch (error) {
      console.error("Batcher polling error:", error);
      process.exit(1);
    }
  });

  // Start filler HTTP server (only after batcher is ready).
  yield* spawn(function* () {
    try {
      yield* call(() => server.listen({ port: PORT, host: "0.0.0.0" }));
      console.log(`Filler HTTP server listening at http://0.0.0.0:${PORT}`);
      yield* suspend();
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    } finally {
      yield* call(() => server.close());
    }
  });

  yield* suspend();
});
