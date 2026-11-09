import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";

/**
 * Wraps a public data provider to log contract-state queries and to drop the
 * empty `{}` offset the indexer rejects. `watchForTxData` is NOT replaced:
 * midnight-js 5 requires its result to carry an era-tagged transaction handle
 * built by midnight-js itself.
 */
export const wrapPublicDataProvider = (
  provider: any,
  logPrefix: string,
) => {
  const wrapOffset = (offset: any) => {
    if (offset && typeof offset === "object" && Object.keys(offset).length === 0) {
      return undefined;
    }
    return offset;
  };

  return {
    ...provider,
    queryContractState: async (address: string, offset?: any) => {
      console.log(` ${logPrefix}: queryContractState called`, { address, offset });
      const result = await provider.queryContractState(address, wrapOffset(offset));
      console.log(` ${logPrefix}: queryContractState result`, result);
      return result;
    },
    subscribeContractActions: (address: string, offset?: any) =>
      provider.subscribeContractActions(address, wrapOffset(offset)),
    subscribeContractState: (address: string, offset?: any) =>
      provider.subscribeContractState(address, wrapOffset(offset)),
  };
};

export function extractPublicCoinAddress(bech32mAddress: string): string {
  const shieldedAddress = MidnightBech32m.parse(bech32mAddress);
  const [coinPublicKey] = [
    Uint8Array.prototype.slice.call(shieldedAddress.data, 0, 32),
  ];
  return Array.from(coinPublicKey as Uint8Array, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
