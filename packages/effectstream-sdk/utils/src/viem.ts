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

/** Transport-level options the caller may set per sync protocol. */
export type ViemTransportOptions = {
  /**
   * Per-request deadline in ms. Without one, viem's own default applies; an
   * endpoint that accepts the connection and never answers would otherwise
   * hang the caller indefinitely. Sync protocols pass their
   * `requestTimeoutMs`.
   */
  timeout?: number;
};

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
  > & ViemTransportOptions,
): PublicClient<transport, chain, ParseAccount<accountOrAddress>, rpcSchema> {
  // `timeout` is a transport option, not a client option; pull it out so it
  // reaches `http()` rather than being spread onto the client config.
  const { timeout, ...clientOverride } = override ?? {};
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0], {
      // batch is needed for sync protocols to be efficient. Does this ever cause issues in other scenarios?
      batch: true,
      ...(timeout != null ? { timeout } : {}),
    }),
    ...clientOverride,
  }) as any;
}
