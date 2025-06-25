import { createPublicClient, defineChain, http, type PublicClient } from "viem";

export function getPaimaEVMPublicClient(): PublicClient {
  const paimaChain = defineChain({
    id: 87401284021,
    name: "Paima",
    nativeCurrency: {
      decimals: 18,
      name: "Paima",
      symbol: "PAIMA",
    },
    rpcUrls: {
      default: {
        http: ["http://localhost:9999/rpc/evm"],
      },
    },
  });

  return createPublicClient({
    chain: paimaChain,
    transport: http(),
  });
}
