import { extractBalances, getContractState, extractPublicCoinAddress } from './midnight-utils.ts';

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
}

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v3/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v3/graphql/ws";
}

const config = new StandaloneConfig();

const getContractAddress = async (): Promise<string> => {
  const r = await fetch("contract_address/unshielded-erc20.undeployed.json");
  const json = await r.json();
  console.log("🔍 Contract address:", json.contractAddress);
  return json.contractAddress;
};

export async function balanceOf(address: string): Promise<bigint> {
  const contractAddress = await getContractAddress();
  const publicStates = await getContractState(config.indexer, config.indexerWS, contractAddress, "balanceOf.ts");
  const balanceMap = extractBalances(publicStates);
  const parsedAddress = address.startsWith("mn_") ? extractPublicCoinAddress(address) : address;
  return balanceMap.get(parsedAddress) ?? 0n;
}
