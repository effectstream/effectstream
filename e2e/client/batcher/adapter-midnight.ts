import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import { MidnightAdapter } from "@effectstream/batcher";

const isEnvTrue = (key: string) => ["true", "1", "yes", "y"].includes((Deno.env.get(key) || "").toLowerCase());
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

const { contractInfo, contractAddress, zkConfigPath } = midnight_enabled ? readMidnightContract("contract-eip-20", "contract-eip-20.json") : {
    contractInfo: undefined,
    contractAddress: undefined,
    zkConfigPath: undefined,
  };
  const midnightAdapterConfig = {
    indexer: "http://localhost:8088/api/v1/graphql",
    indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
    node: "http://localhost:9944",
    proofServer: "http://localhost:6300",
    zkConfigPath,
    privateStateStoreName: "simpletoken-private-state", // Local LevelDB store
    privateStateId: "simpletokenPrivateState", // On-chain contract ID (must match deploy.ts)
  }
  const GENESIS_MINT_WALLET_SEED =
    "0000000000000000000000000000000000000000000000000000000000000001";
  export const midnightAdapter = midnight_enabled ? new MidnightAdapter(
    contractAddress,
    GENESIS_MINT_WALLET_SEED,
    midnightAdapterConfig,
    new SimpleToken.Contract(witnesses),
    witnesses,
    contractInfo,
    0, // NetworkId.Undeployed,
    "parallelMidnight",
  ) : undefined;