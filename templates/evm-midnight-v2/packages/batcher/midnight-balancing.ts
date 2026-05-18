import { MidnightAdapter } from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { Counter, witnesses } from "@evm-midnight/midnight-contract";

export interface MidnightBalancingEnv {
  networkId?: string;
  syncProtocolName: string;
}

function getMidnightContractData(networkId: string) {
  const data = readMidnightContract("contract-round-value", { networkId });
  if (!data.contractAddress) {
    throw new Error(`Midnight contract address not found for networkId=${networkId}`);
  }
  return data;
}

export function createMidnightBalancingAdapter(env: MidnightBalancingEnv) {
  const networkId = env.networkId ?? midnightNetworkConfig.id;
  const contractData = getMidnightContractData(networkId);

  return new MidnightAdapter(
    contractData.contractAddress,
    midnightNetworkConfig.walletSeed!,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath: contractData.zkConfigPath,
      privateStateStoreName: "counter-private-state",
      privateStateId: "counterPrivateState",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: networkId,
    },
    new Counter.Contract(witnesses),
    witnesses,
    contractData.contractInfo,
    env.syncProtocolName,
  );
}
