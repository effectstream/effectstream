import { STAGENET_PROFILE_DEFAULTS } from "../../network-config/src/network-profile.ts";

export const SINK_EVENT_PREFIX = "midnightSinkEvent";

export function createNodeConfig(input: {
  sinkContractAddress: string;
  startBlockHeight: number;
}) {
  const contractAddress = input.sinkContractAddress.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(contractAddress)) {
    throw new Error("The Midnight sink contract address must be 32-byte hex");
  }
  if (!Number.isSafeInteger(input.startBlockHeight) || input.startBlockHeight < 0) {
    throw new Error("The Midnight deployment start block must be a non-negative integer");
  }
  return {
    network: STAGENET_PROFILE_DEFAULTS,
    syncProtocol: {
      type: "midnight-graphql-parallel" as const,
      name: "midnight-stagenet-v2" as const,
      indexer: STAGENET_PROFILE_DEFAULTS.indexerHttpUrl,
    },
    primitive: {
      name: "crypto-event-sink-events" as const,
      type: "Midnight:ContractEvent" as const,
      startBlockHeight: input.startBlockHeight,
      stateMachinePrefix: SINK_EVENT_PREFIX,
      contractAddress,
      eventType: "Unpaused" as const,
    },
  };
}
