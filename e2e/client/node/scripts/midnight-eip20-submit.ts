import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import {
  httpClientProofProvider,
} from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import {
  indexerPublicDataProvider,
} from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
  NodeZkConfigProvider,
} from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  levelPrivateStateProvider,
} from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type {
  MidnightProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { SimpleToken, witnesses } from "@e2e/midnight-contracts/eip-20";
import {
  readMidnightContract,
} from "@effectstream/midnight-contracts/read-contract";
import {
  buildWalletFacade,
  syncAndWaitForFunds,
  type WalletResult,
} from "@effectstream/midnight-contracts/wallet-info";
import { parseCircuitArgs } from "@effectstream/batcher";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const GENESIS_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const DEFAULT_PAYLOAD = {
  circuit: "mint",
  args: [
    {
      is_left: true,
      left: {
        bytes:
          "0x00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
      },
      right: {
        bytes:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
    20000,
  ],
};

function createWalletProvider(
  walletResult: WalletResult,
): WalletProvider & MidnightProvider {
  const {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    walletDustSecretKey,
  } = walletResult;

  return {
    getCoinPublicKey() {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey() {
      return zswapSecretKeys.encryptionPublicKey;
    },
    balanceTx(tx, _newCoins, ttl) {
      return wallet.balanceTransaction(
        walletZswapSecretKeys,
        walletDustSecretKey,
        tx,
        ttl ?? new Date(Date.now() + 60 * 60 * 1000),
      );
    },
    submitTx(tx) {
      return wallet.submitTransaction(tx);
    },
  };
}

async function main() {
  const payloadArg = Deno.args[0];
  const payload = payloadArg ? JSON.parse(payloadArg) : DEFAULT_PAYLOAD;

  const seed = Deno.env.get("MIDNIGHT_WALLET_SEED") ?? GENESIS_SEED;

  const { contractAddress, contractInfo, zkConfigPath } = readMidnightContract(
    "contract-eip-20",
    "contract-eip-20.json",
    { networkId: midnightNetworkConfig.id },
  );

  setNetworkId(midnightNetworkConfig.id as any);

  const networkUrls = {
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };

  const walletResult = await buildWalletFacade(
    networkUrls,
    seed,
    midnightNetworkConfig.id as any,
  );

  console.log("Waiting for wallet sync...");
  await syncAndWaitForFunds(walletResult.wallet);
  console.log("Wallet ready");

  const walletProvider = createWalletProvider(walletResult);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "simpletoken-private-state-cli",
      walletProvider,
    } as any),
    publicDataProvider: indexerPublicDataProvider(
      networkUrls.indexer,
      networkUrls.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
    proofProvider: httpClientProofProvider(networkUrls.proofServer),
    walletProvider,
    midnightProvider: walletProvider,
  };

  const contract = await findDeployedContract(providers, {
    contractAddress,
    contract: new SimpleToken.Contract(witnesses),
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });

  const parsedArgs = parseCircuitArgs(
    payload.circuit,
    payload.args,
    contractInfo,
  );

  console.log(
    `Submitting ${payload.circuit} with args ${JSON.stringify(payload.args)}`,
  );
  const result = await contract.callTx[payload.circuit](...parsedArgs);
  console.log(
    `Transaction submitted. Hash: ${result.public.txId}, block ${result.public.blockHeight}`,
  );

  await walletResult.wallet.stop();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Mint submission failed:", err);
    Deno.exit(1);
  });
}
