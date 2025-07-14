import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { ENV } from "@paima/utils";

export function getPaimaEVMPublicClient(): PublicClient {
  const paimaChain = defineChain({
    id: ENV.PAIMA_CHAIN_ID,
    name: "Paima",
    nativeCurrency: {
      decimals: 18,
      name: "Paima",
      symbol: "PAIMA",
    },
    rpcUrls: {
      default: {
        http: [`http://localhost:${ENV.PAIMA_API_PORT}/rpc/evm`],
      },
    },
  });

  return createPublicClient({
    chain: paimaChain,
    transport: http(),
  });
}
