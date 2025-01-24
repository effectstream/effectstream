import type {
  Account,
  Address,
  HttpTransport,
  ParseAccount,
  PublicClient,
  PublicClientConfig,
  RpcSchema,
  Transport,
} from "viem";
import { type Chain, createPublicClient, http } from "viem";
import type { Evm4ByteSelector, EvmSelector } from "./types/nominal.ts";

export function truncateSelector(fullSelector: EvmSelector): Evm4ByteSelector {
  return fullSelector.slice(0, 10) as Evm4ByteSelector;
}

export function createViemPublicClient<
  chain extends Chain,
  transport extends Transport = HttpTransport,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  chain: chain,
  override?: Partial<
    Omit<
      PublicClientConfig<transport, chain, accountOrAddress, rpcSchema>,
      "chain"
    >
  >,
): PublicClient<transport, chain, ParseAccount<accountOrAddress>, rpcSchema> {
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0], {
      // batch is needed for sync protocols to be efficient. Does this ever cause issues in other scenarios?
      batch: true,
      // TODO: transport options should come from the sync protocol configuration
    }),
    ...override,
  }) as any;
}
