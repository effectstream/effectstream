import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { relayAbi, relayPayloadHash, type RelayPayload } from "./ckb-event-relay.ts";

// Keep relay writes off Hardhat account 0, which the existing sync E2E uses
// concurrently. A dedicated unlocked local account avoids transaction nonce races.
const localRelayer = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const localRpcUrl = "http://127.0.0.1:8545";
const localChainId = 31337n;

export function assertLocalRelayDestination(rpcUrl: string, chainId: bigint): void {
  let url: URL;
  try { url = new URL(rpcUrl); } catch { throw new Error("EVM RPC URL must be a valid URL."); }
  const hostname = url.hostname.toLowerCase();
  if (!(["localhost", "127.0.0.1", "[::1]"].includes(hostname)) ||
    !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`Automated relay E2E requires a loopback RPC URL; got ${rpcUrl}.`);
  }
  if (chainId !== localChainId) {
    throw new Error(`Automated relay E2E requires chain ID ${localChainId}; got ${chainId}.`);
  }
}

async function createClients(rpcUrl: string, expectedChainId: bigint, configuredKey?: Hex, allowRemote = false) {
  if (!allowRemote) assertLocalRelayDestination(rpcUrl, expectedChainId);
  const transport = http(rpcUrl, { retryCount: 0, timeout: 10_000 });
  const publicClient = createPublicClient({ transport });
  const actualChainId = await publicClient.getChainId();
  if (BigInt(actualChainId) !== expectedChainId) {
    throw new Error(`EVM chain ID mismatch: expected ${expectedChainId}, got ${actualChainId}.`);
  }
  const chain: Chain = {
    id: actualChainId,
    name: "EffectStream relay destination",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const account = configuredKey ? privateKeyToAccount(configuredKey) : localRelayer;
  const walletClient = createWalletClient({ account, chain, transport });
  const accountAddress = typeof account === "string" ? account : account.address;
  return { publicClient, walletClient, accountAddress, chainId: BigInt(actualChainId), rpcUrl, allowRemote };
}

/** Fixed destination for the repository's automated E2E. It deliberately ignores environment overrides. */
export async function createLocalRelayClients() {
  return createClients(localRpcUrl, localChainId);
}

/** Configurable adapter for explicit callers. Remote submission requires EFFECTSTREAM_EVM_ALLOW_REMOTE=true. */
export async function createRelayClients() {
  const rpcUrl = process.env["EFFECTSTREAM_EVM_RPC_URL"] ?? localRpcUrl;
  const expectedChainId = BigInt(process.env["EFFECTSTREAM_EVM_CHAIN_ID"] ?? "31337");
  const allowRemote = process.env["EFFECTSTREAM_EVM_ALLOW_REMOTE"] === "true";
  const configuredKey = process.env["EFFECTSTREAM_EVM_PRIVATE_KEY"] as Hex | undefined;
  return createClients(rpcUrl, expectedChainId, configuredKey, allowRemote);
}

export async function submitRelay(
  clients: Awaited<ReturnType<typeof createRelayClients>>,
  contractAddress: Address,
  payload: RelayPayload,
  onSubmitted?: (transactionHash: Hex, payloadHash: Hex) => Promise<void>,
) {
  const { publicClient, walletClient, accountAddress, chainId } = clients;
  if (!clients.allowRemote) assertLocalRelayDestination(clients.rpcUrl, chainId);
  const payloadHash = relayPayloadHash(payload, chainId, contractAddress);
  const existing = await publicClient.readContract({
    address: contractAddress, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
  });
  if (existing !== `0x${"0".repeat(64)}`) {
    if (existing !== payloadHash) throw new Error("Source event ID is already accepted with a different payload.");
    return { payloadHash, alreadyAccepted: true as const };
  }

  const authorized = await publicClient.readContract({
    address: contractAddress, abi: relayAbi, functionName: "authorizedRelayer", args: [accountAddress],
  });
  if (!authorized) throw new Error(`Configured signer ${accountAddress} is not an authorized relayer.`);

  const hash = await walletClient.writeContract({
    address: contractAddress, abi: relayAbi, functionName: "relay", args: [payload],
  });
  await onSubmitted?.(hash, payloadHash);
  // Never auto-resubmit after an ambiguous response. Contract idempotency and
  // an explicit accepted-state check make caller-directed retries safe.
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000, retryCount: 3 });
  if (receipt.status !== "success" || receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
    throw Object.assign(
      new Error(`Relay transaction ${hash} did not succeed at ${contractAddress}.`),
      { transactionHash: hash, receiptStatus: receipt.status },
    );
  }
  const accepted = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({ abi: relayAbi, ...log });
      return decoded.eventName === "SourceEventAccepted" &&
        decoded.args.eventId === payload.eventId && decoded.args.payloadHash === payloadHash;
    } catch { return false; }
  });
  if (!accepted) throw new Error(`Relay transaction ${hash} omitted the expected acceptance event.`);
  const stored = await publicClient.readContract({
    address: contractAddress, abi: relayAbi, functionName: "acceptedPayloadHash", args: [payload.eventId],
  });
  if (stored !== payloadHash) throw new Error(`Relay transaction ${hash} did not store the expected payload hash.`);
  return { payloadHash, alreadyAccepted: false as const, transactionHash: hash, receipt };
}
