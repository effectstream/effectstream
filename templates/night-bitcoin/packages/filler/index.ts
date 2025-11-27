import fastify from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { main, suspend, spawn, call } from "effection";
import { createNewBatcher, buildBitcoinSignatureMessage } from "@paimaexample/batcher";
import { AddressType } from "@paimaexample/utils";
import { buildBatcherSetup, FILLER_BATCHER_DEFAULTS } from "./batcher/config.ts";
// Bitcoin signature dependencies
import * as bitcoin from "bitcoinjs-lib";
import * as bitcoinMessage from "bitcoinjs-message";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as bip32 from "bip32";
// Midnight dependencies
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";

const ECPair = ecpair.ECPairFactory(tinysecp);
const BIP32 = bip32.BIP32Factory(tinysecp);
const NETWORK = bitcoin.networks.regtest;

const args = Deno.args;
const FILLER_NAME = args[0];
const PORT = parseInt(args[1], 10);
const BITCOIN_WALLET_PATH = args[2];
const MIDNIGHT_WALLET_PATH = args[3];

if (!FILLER_NAME || !PORT || !BITCOIN_WALLET_PATH || !MIDNIGHT_WALLET_PATH) {
  throw new Error("FILLER_NAME, PORT, and wallet paths are required.");
}

// Load Bitcoin wallet
console.log(`📁 Loading Bitcoin wallet JSON from: ${BITCOIN_WALLET_PATH}`);
const bitcoinWalletData = JSON.parse(Deno.readTextFileSync(BITCOIN_WALLET_PATH));
const seedHex = bitcoinWalletData.seed.replace("0x", "");
const bitcoinSeed = Buffer.from(seedHex, "hex");
const masterNode = BIP32.fromSeed(bitcoinSeed, NETWORK);
const derivedAccount = masterNode.derivePath(bitcoinWalletData.derivationPath);
const bitcoinKeyPair = ECPair.fromPrivateKey(Buffer.from(derivedAccount.privateKey!), { network: NETWORK });
const bitcoinAddress = bitcoin.payments.p2wpkh({
  pubkey: bitcoinKeyPair.publicKey,
  network: NETWORK
}).address!;

console.log(`🔑 Loaded Bitcoin wallet: ${bitcoinAddress}`);

// Load Midnight wallet
const midnightWalletData = JSON.parse(Deno.readTextFileSync(MIDNIGHT_WALLET_PATH));
const midnightSeed = midnightWalletData.seed;

console.log(`🔑 Loaded Midnight wallet: ${midnightWalletData.address}`);

// --- Batcher Setup ---

// NOTE: In production, each filler would have its own unique seed and config.
// For this template, we load the wallet seed from the generated wallet file.
const batcherWif = derivedAccount.toWIF();

const batcherSetup = buildBatcherSetup({
  fillerName: FILLER_NAME,
  // The batcher internal HTTP server is not needed as we trigger execution directly from the API.
  batcherPort: 0, 
  pollingIntervalMs: FILLER_BATCHER_DEFAULTS.pollingInterval,
  midnightSeed: midnightSeed,
  bitcoin: {
    rpcUrl: FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl,
    walletName: FILLER_BATCHER_DEFAULTS.bitcoin.walletName,
    rpcUser: FILLER_BATCHER_DEFAULTS.bitcoin.rpcUser,
    rpcPass: FILLER_BATCHER_DEFAULTS.bitcoin.rpcPass,
    batcherWif,
  },
});

console.log(
  `🧩 Batcher configured with wallet seed file ${BITCOIN_WALLET_PATH}, address ${bitcoinAddress}, WIF length ${batcherWif.length}`,
);

const batcher = createNewBatcher(batcherSetup.config, batcherSetup.storage);

batcher
  .addBlockchainAdapter("midnight", batcherSetup.adapters.midnight, {
    criteriaType: "size",
    maxBatchSize: 1,
  })
  .addBlockchainAdapter("bitcoin", batcherSetup.adapters.bitcoin, {
    criteriaType: "hybrid",
    timeWindowMs: 1000,
    maxBatchSize: 5,
  })
  .setDefaultTarget("midnight");

// --- HTTP Server Setup ---

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
});

const NotifyPaymentSchema = Type.Object({
  orderId: Type.String(),
  toAddress: Type.String(),
  amount: Type.Number(), 
  token: Type.String(),
  chainId: Type.String()
});

const NotifyPaymentResponseSchema = Type.Object({
  status: Type.String(),
  orderId: Type.String(),
});


const toHex = (bytes: Uint8Array) => {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

const wrapInEither = (value: any) => ({
  is_left: true,
  left: value,
  right: { bytes: toHex(new Uint8Array(32).fill(0)) },
});

const extractPublicAddress = (bech32mAddress: string) => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(bech32mAddress),
  );
  return toHex(shieldedAddress.coinPublicKey.data);
};

const tokens = ["btc", "eth", "m20", "wbtc"];
const basePrices = [100000, 4000, 0.5, 100000];

const getConversion = (
  fromAmount: number,
  fromToken: string,
  toToken: string
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

server.post<{
  Body: Static<typeof QuoteParamsSchema>;
  Reply: Static<typeof QuoteResponseSchema>;
}>("/api/quote", async (request, reply) => {
  const { orderId, fromToken, toToken, fromAmount } = request.body;

  const basisPoints = 10; // 0.01% * 10 = 0.1% => 10 basis points

  const conversionRate = getConversion(fromAmount, fromToken, toToken);
  const fee = (basisPoints * conversionRate) / 10000;

  const quote: Static<typeof QuoteResponseSchema> = {
    orderId: orderId,
    fromToken: fromToken,
    filler: FILLER_NAME!,
    toToken: toToken,
    fromAmount: fromAmount,
    toAmount: conversionRate - fee,
    fee: fee,
  };

  reply.send(quote);
});

server.post<{
  Body: Static<typeof NotifyPaymentSchema>;
  Reply: Static<typeof NotifyPaymentResponseSchema>;
}>("/api/notify-filler-intent-payment", async (request, reply) => {
  const { orderId, toAddress, amount, token } = request.body;
  console.log(
    `🔔 Notification received: order=${orderId}, token=${token}, amount=${amount}, to=${toAddress}, fillerWallet=${bitcoinAddress}`,
  );

  try {
    if (token === "btc") {
      const satoshis = Math.floor(amount); 
      const timestamp = new Date().toISOString();

      const payload = {
        toAddress: toAddress,
        amountSats: satoshis
      };

      // Build the message to sign
      const message = buildBitcoinSignatureMessage(payload, timestamp);
      
      // Sign with Bitcoin private key
      const signature = bitcoinMessage.sign(
        message,
        bitcoinKeyPair.privateKey!,
        bitcoinKeyPair.compressed
      ).toString('base64');

      await batcher.batchInput({
        address: bitcoinAddress,
        addressType: -1,
        input: JSON.stringify(payload),
        signature,
        timestamp,
        target: "bitcoin"
      }, "wait-receipt");

    } else if (token === "m20") {
       const timestamp = new Date().toISOString();
       const publicAddress = extractPublicAddress(toAddress);
       // Queue the transaction via the Batcher
       await batcher.batchInput({
          address: "filler-midnight",
          addressType: AddressType.MIDNIGHT,
          input: JSON.stringify({
             circuit: "transfer",
             args: [wrapInEither({bytes: publicAddress}), amount],
          }),
          signature: "0x",
          timestamp,
          target: "midnight"
       }, "no-wait");
    }
  } catch (e) {
    console.error("Error executing payment:", e);
    reply.status(500).send({ status: "error", orderId });
    return;
  }

  reply.send({ status: "processing", orderId });
});


batcher.addStateTransition("error", (input) => {
  console.error("------🦊🦊🦊🦊🦊🦊🦊🦊🦊🦊-----");
  console.error("Error executing payment:", input);
  console.error("------🦊🦊🦊🦊🦊🦊🦊🦊🦊🦊-----");
  return;
});

batcher.addStateTransition("batch:submit", (input) => {
  console.log("------🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸-----");
  console.log("Batch submitted:", input);
  console.log("------🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸-----");
  return;
});


// --- Main Execution ---

main(function* () {
  console.log(`🚀 Starting Filler "${FILLER_NAME}" Service on port ${PORT}`);

  // Initialize batcher synchronously - fail fast if wallet not ready
  try {
    console.log("🔄 Initializing batcher (waiting for Midnight wallet sync & funds)...");
    yield* call(() => batcher.init());
    console.log("✅ Batcher initialized and ready!");
  } catch (error) {
    console.error("❌ Batcher initialization failed:", error);
    console.error("💡 Ensure the Midnight wallet is funded before starting the filler");
    Deno.exit(1);
  }

  // Start batcher polling loop (batcher is already initialized)
  yield* spawn(function*() {
    try {
      yield* batcher.runPollingLoop();
    } catch (error) {
      console.error("❌ Batcher polling error:", error);
      Deno.exit(1);
    }
  });

  // Start Filler HTTP Server (only after batcher is ready)
  yield* spawn(function*() {
    try {
        yield* call(() => server.listen({ port: PORT, host: '0.0.0.0' }));
        console.log(`✅ Filler HTTP Server listening at http://0.0.0.0:${PORT}`);
        
        yield* suspend();
    } catch (err) {
        server.log.error(err);
        Deno.exit(1);
    } finally {
        yield* call(() => server.close());
    }
  });

  yield* suspend();
});
