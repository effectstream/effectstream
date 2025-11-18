import fastify from "fastify";
import { type Static, Type } from "@sinclair/typebox";

const server = fastify();

const args = Deno.args;
const FILLER_NAME = args[0];
const PORT = parseInt(args[1], 10);

if (!FILLER_NAME || !PORT) {
  throw new Error("FILLER_NAME and PORT environment variables are required.");
}

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

server.listen({ port: parseInt(PORT, 10), host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    Deno.exit(1);
  }
  console.log(`Filler ${FILLER_NAME} server listening at ${address}`);
});