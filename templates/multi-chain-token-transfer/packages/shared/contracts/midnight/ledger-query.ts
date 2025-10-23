import {
  MultiChainMultiToken,
} from "./contract-eip-1155/src/index.original.ts";
import {
  type ContractAddress,
} from "npm:@midnight-ntwrk/compact-runtime";
import { MidnightProviders } from "npm:@midnight-ntwrk/midnight-js-types";
import { assertIsContractAddress } from "npm:@midnight-ntwrk/midnight-js-utils";
import { getPublicStates } from 'npm:@midnight-ntwrk/midnight-js-contracts';
import { resolve, dirname } from "@std/path";
import { exists } from "@std/fs";
import { indexerPublicDataProvider } from "npm:@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { LedgerState } from "npm:@midnight-ntwrk/ledger";

// Simplified types - using any to avoid complex type constraints
type MultiChainMultiTokenProviders = MidnightProviders<any, any, any>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
}

const config = new StandaloneConfig();

const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

// Simple function to get and display the ledger state
export const queryLedgerState = async (
  providers: MultiChainMultiTokenProviders,
  contractAddress: ContractAddress,
) => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Querying contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );

    if (contractState == null) {
      console.log("❌ No contract state found");
      return null;
    }

    // This is the key line - getting the ledger view using MultiChainMultiToken.ledger
    const ledgerView = MultiChainMultiToken.ledger(contractState.data);
    console.log("ledgerView", ledgerView);

    console.log("📊 Ledger state:");
    console.log(
      JSON.stringify(
        ledgerView,
        (_key, value) => typeof value === "bigint" ? value.toString() : value,
        2,
      )
    );

    return ledgerView;
  } catch (error) {
    console.error("❌ Error querying ledger state:", error);
    throw error;
  }
};

const getContractAddress = async (): Promise<string> => {
  // First try to get from command line arguments
  const contractAddressFromArgs = Deno.args[0];

  if (contractAddressFromArgs) {
    console.log(
      `📋 Using contract address from arguments: ${contractAddressFromArgs}`,
    );
    return contractAddressFromArgs;
  }

  // If not provided via args, try to read from contract.json file
  const contractAddressFile = resolve(currentDir, "contract.json");

  try {
    if (await exists(contractAddressFile)) {
      const contractAddressFromFile = JSON.parse(
        await Deno.readTextFile(contractAddressFile),
      ).contractAddress;

      if (contractAddressFromFile) {
        console.log(
          `📄 Using contract address from file ${contractAddressFile}: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;
      } else {
        throw new Error("Contract address file is empty");
      }
    } else {
      throw new Error(
        `Contract address file not found at ${contractAddressFile}`,
      );
    }
  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: deno run --allow-all ledger-query.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract.json file with the contract address",
    );
    Deno.exit(1);
  }
};

const convertToEither = (rawValue: [Uint8Array, Uint8Array, Uint8Array]) => {
  const isLeft = rawValue[0].toString() === "1";
  return {
    is_left: isLeft,
    left: { bytes: rawValue[1].toHex() },
    right: { bytes: rawValue[2].toHex() },
  };
}
// Run the script if this file is executed directly
if (import.meta.main) {
  (async () => {
    try {
      console.log("🚀 Starting ledger query...");

      // Get contract address from command line arguments or file
      const contractAddress = await getContractAddress();

      console.log(`🔗 Querying ledger for contract: ${contractAddress}`);

      // Create minimal providers for querying
      const providers = {
        publicDataProvider: indexerPublicDataProvider(
          config.indexer,
          config.indexerWS,
        ),
      };

      const publicStates = await getPublicStates(providers.publicDataProvider, contractAddress);
      const balances = publicStates.contractState.data.asArray()![0]?.asMap();
      const balanceKey = balances?.keys()[0];
      const tokenBalance = balances?.get(balanceKey!)?.asMap();
      const simplifiedBalanceMap = tokenBalance?.keys().reduce((acc, key) => {
        const mapKeyEither = convertToEither(key.value as [Uint8Array, Uint8Array, Uint8Array]);
        const mapKey = mapKeyEither.is_left ? mapKeyEither.left.bytes : mapKeyEither.right.bytes;
        console.log("mapKey", mapKey, ' length: ', mapKey.length);
        const mapValue = BigInt("0x" + Array.from(tokenBalance?.get(key)?.asCell().value[0].reverse() ?? new Uint8Array())
          .map(b => b.toString(16).padStart(2, "0"))
          .join(""));
        acc.set(mapKey, mapValue);
        return acc;
      }, new Map<string, bigint>())
      console.log("simplified balance map", simplifiedBalanceMap);
      return simplifiedBalanceMap;
    } catch (error) {
      console.error("❌ Error during ledger query:", error);
      Deno.exit(1);
    }
  })();
}