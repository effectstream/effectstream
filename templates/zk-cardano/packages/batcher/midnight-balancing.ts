import { MidnightAdapter } from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { Ballot, createWitnesses } from "@zk-cardano/midnight-contract";

const BATCHER_SECRET_KEY = new Uint8Array(32);
BATCHER_SECRET_KEY[31] = 0x02;
const witnesses = createWitnesses(BATCHER_SECRET_KEY);

export interface MidnightBalancingEnv {
  networkId?: string;
  syncProtocolName: string;
}

function getMidnightContractData(networkId: string) {
  const data = readMidnightContract("contract-ballot", { networkId });
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
      privateStateStoreName: "ballot-private-state",
      privateStateId: "ballotPrivateState",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: networkId,
    },
    new Ballot.Contract(witnesses),
    witnesses,
    contractData.contractInfo,
    env.syncProtocolName,
  );
}
