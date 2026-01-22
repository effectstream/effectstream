import { getPublicStates, PublicContractStates } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';


interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v3/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v3/graphql/ws";
}

const getContractAddress = async (): Promise<string> => {
  const r = await fetch("contract_address/unshielded-erc20.undeployed.json");
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

const config = new StandaloneConfig();
const wrapPublicDataProvider = (provider: any) => {
  const wrapOffset = (offset: any) => {
    if (offset && typeof offset === 'object' && Object.keys(offset).length === 0) {
      return undefined;
    }
    return offset;
  };

  return {
    ...provider,
    queryContractState: (address: string, offset?: any) => 
      provider.queryContractState(address, wrapOffset(offset)),
  };
};

const providers = {
  publicDataProvider: wrapPublicDataProvider(indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  )),
};

function extractPublicCoinAddress(bech32mAddress: string): string {
  const shieldedAddress = MidnightBech32m.parse(bech32mAddress);
  const [coinPublicKey, encryptionPublicKey] = [
    Uint8Array.prototype.slice.call(shieldedAddress.data, 0, 32),
    Uint8Array.prototype.slice.call(shieldedAddress.data, 32),
  ];
  return toHex(coinPublicKey);
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function convertToBigInt(tokenBalance: Uint8Array) {
  return BigInt("0x" + Array.from(tokenBalance?.reverse() ?? new Uint8Array())
  .map(b => b.toString(16).padStart(2, "0"))
  .join(""));
}

const convertToEither = (rawValue: [Uint8Array, Uint8Array, Uint8Array]) => {
  const isLeft = rawValue[0].toString() === "1";
  return {
    is_left: isLeft,
    left: { bytes: toHex(rawValue[1]) },
    right: { bytes: toHex(rawValue[2]) },
  };
}
function getBalanceMap(publicStates: PublicContractStates): Map<string, bigint> {
  const balanceMap = new Map<string, bigint>();
  //   Array(2) [
  //     Array(1) [
  //         Map {
  //             <[01, 17caeea787eb6b34efd2d8ee7472c99f23fa4373a8ee8f9817d748c4d53560bb, -]: b1b32b32>: <[00d0ed902e]: b16>,
  //         },
  //     ],
  //     Array(15) [
  //         Map {},
  //         <[00d0ed902e]: b16>,
  //         <[4d3230]: c>,
  //         <[4d3230]: c>,
  //         <[08]: b1>,
  //         <[01]: b1>,
  //         <[-, -, -]: b1b32b32>,
  //         <[-]: b1>,
  //         Map {},
  //         <[-, -]: cb16>,
  //         <[e903]: b16>,
  //         <[01, 17caeea787eb6b34efd2d8ee7472c99f23fa4373a8ee8f9817d748c4d53560bb, -]: b1b32b32>,
  //         <[01, 17caeea787eb6b34efd2d8ee7472c99f23fa4373a8ee8f9817d748c4d53560bb, -]: b1b32b32>,
  //         <[-]: c>,
  //         <[00e8764817]: b16>,
  //     ],
  // ]


  const balances = publicStates.contractState.balance;
  const balanceKeys = balances?.keys()!;
  try {
    for (const balanceKey of balanceKeys) {
      // Get Address from Map Key
      const addressEither = convertToEither(balanceKey.value as any);
      const address = addressEither.is_left ? addressEither.left.bytes : addressEither.right.bytes;
      // Get Token Balance from Map Value
      const cell = balances!.get(balanceKey!)!.asCell();
      // Set in Map
      balanceMap.set(address, convertToBigInt(cell!.value[0]));
    }
  } catch (error) {
    console.error("Error getting balance map", error);
    return new Map<string, bigint>();
  }
  return balanceMap;
}

export async function balanceOf(address: string): Promise<bigint> {
  const contractAddress = await getContractAddress();
  const publicStates = await getPublicStates(providers.publicDataProvider, contractAddress);
  const balanceMap = getBalanceMap(publicStates);
  const parsedAddress = address.startsWith("mn_") ? extractPublicCoinAddress(address) : address;
  return balanceMap.get(parsedAddress) ?? 0n;
}
