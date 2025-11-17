import {
  MultiChainMultiToken,
} from "@multi-chain-transfer/midnight-contract-eip-1155";
import { getPublicStates, PublicContractStates } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';


interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v1/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v1/graphql/ws";
}

const getContractAddress = async (): Promise<string> => {
  const r = await fetch("contract_address/contract.json");
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

const config = new StandaloneConfig();
const providers = {
  publicDataProvider: indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  ),
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
const convertToEither = (rawValue: [Uint8Array, Uint8Array, Uint8Array]) => {
  console.log("rawValue", rawValue);
  const isLeft = rawValue[0].toString() === "1";
  return {
    is_left: isLeft,
    left: { bytes: toHex(rawValue[1]) },
    right: { bytes: toHex(rawValue[2]) },
  };
}

function getBalanceMap(publicStates: PublicContractStates): Map<string, bigint> {
  const balances = publicStates.contractState.data.asArray()![0]?.asMap();
  const balanceKey = balances?.keys()[0];
  let tokenBalance;

  try {
    tokenBalance = balances?.get(balanceKey!)?.asMap();
  } catch (error) {
    console.error("Error getting balance map", error);
    return new Map<string, bigint>();
  }
  
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
  return simplifiedBalanceMap ?? new Map<string, bigint>();
}

export async function balanceOf(address: string): Promise<bigint> {
  const contractAddress = await getContractAddress();
  const publicStates = await getPublicStates(providers.publicDataProvider, contractAddress);
  const balanceMap = getBalanceMap(publicStates);
  const parsedAddress = address.startsWith("mn_") ? extractPublicCoinAddress(address) : address;
  return balanceMap.get(parsedAddress) ?? 0n;
}
