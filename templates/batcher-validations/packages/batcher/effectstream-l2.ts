import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";
import { contractAddressesEvmMain } from "@batcher-validations/contracts-evm";

export interface EffectstreamL2Env {
  chainId: number;
  contractModule: string;
  privateKey: string;
  fee: bigint;
  syncProtocolName: string;
}

function getContractAddress(chainId: number, contractModule: string): `0x${string}` {
  const addresses = contractAddressesEvmMain() as Record<string, Record<string, `0x${string}`>>;
  const address = addresses[`chain${chainId}`]?.[contractModule];
  if (!address) {
    throw new Error(`Contract address not found for chain${chainId}/${contractModule}`);
  }
  return address;
}

export function createEffectstreamL2Adapter(env: EffectstreamL2Env) {
  const contractAddress = getContractAddress(env.chainId, env.contractModule);
  return new EffectstreamL2DefaultAdapter(
    contractAddress,
    env.privateKey,
    env.fee,
    env.syncProtocolName,
  );
}
