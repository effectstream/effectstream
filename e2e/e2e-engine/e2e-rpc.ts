import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { ENV } from "@effectstream/utils/node-env";

export function getEffectstreamEVMPublicClient(): PublicClient {
  const paimaChain = defineChain({
    id: ENV.EFFECTSTREAM_CHAIN_ID,
    name: "Effectstream",
    nativeCurrency: {
      decimals: 18,
      name: "Effectstream",
      symbol: "EXS",
    },
    rpcUrls: {
      default: {
        http: [`http://localhost:${ENV.EFFECTSTREAM_API_PORT}/rpc/evm`],
      },
    },
  });

  return createPublicClient({
    chain: paimaChain,
    transport: http(),
  });
}
