import fastify from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { main, suspend, spawn, call } from "effection";
import { createNewBatcher } from "@paimaexample/batcher";
import { AddressType } from "@effectstream/utils";
import { buildBatcherSetup, FILLER_BATCHER_DEFAULTS } from "./batcher/config.ts";

const args = Deno.args;
const FILLER_NAME = args[0];
const PORT = parseInt(args[1], 10);

if (!FILLER_NAME || !PORT) {
  throw new Error("FILLER_NAME and PORT environment variables are required.");
}

// --- Batcher Setup ---

// NOTE: In production, each filler would have its own unique seed and config.
// For this template, we reuse the default dev credentials but give them unique namespaces.
const batcherSetup = buildBatcherSetup({
  fillerName: FILLER_NAME,
  // The batcher internal HTTP server is not needed as we trigger execution directly from the API.
  batcherPort: 0, 
  pollingIntervalMs: FILLER_BATCHER_DEFAULTS.pollingInterval,
  midnightSeed: FILLER_BATCHER_DEFAULTS.midnightSeed,
  bitcoin: {
    rpcUrl: FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl,
    rpcUser: FILLER_BATCHER_DEFAULTS.bitcoin.rpcUser,
    rpcPass: FILLER_BATCHER_DEFAULTS.bitcoin.rpcPass,
    seed: FILLER_BATCHER_DEFAULTS.bitcoin.seed,
  },
});

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
  console.log(`🔔 Notification received for Order ${orderId} - Paying ${amount} ${token} to ${toAddress}`);

  try {
    if (token === "btc") {
      const satoshis = Math.floor(amount); 
      const timestamp = new Date().toISOString();

      // TODO: sign and provide filler's batcher btc address
      await batcher.batchInput({
        address: "filler-btc", 
        addressType: 0,
        input: JSON.stringify({
           type: "transfer",
           toAddress: toAddress,
           amount: satoshis
        }),
        signature: "0x", // TODO: Sign with btc message using private key
        timestamp,
        target: "bitcoin"
      });

    } else if (token === "m20") {
       const timestamp = new Date().toISOString();
       // Queue the transaction via the Batcher
       await batcher.batchInput({
          address: "filler-midnight",
          addressType: AddressType.MIDNIGHT,
          input: JSON.stringify({
             type: "transfer",
             toAddress: toAddress,
             amount: Math.floor(amount)
          }),
          signature: "0x",
          timestamp,
          target: "midnight"
       });
    }
  } catch (e) {
    console.error("Error executing payment:", e);
    reply.status(500).send({ status: "error", orderId });
    return;
  }

  reply.send({ status: "processing", orderId });
});


// --- Main Execution ---

main(function* () {
  console.log(`🚀 Starting Filler "${FILLER_NAME}" Service on port ${PORT}`);

  // Start the Batcher
  yield* spawn(function*() {
      try {
        yield* batcher.runBatcher();
      } catch (error) {
        console.error("❌ Batcher error:", error);
        yield* batcher.gracefulShutdownOp();
      }
  });

  // Start the HTTP Server
  yield* spawn(function*() {
    try {
        yield* call(() => server.listen({ port: PORT, host: '0.0.0.0' }));
        console.log(`HTTP Server listening at http://0.0.0.0:${PORT}`);
        
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
