import {
  encodeAbiParameters,
  keccak256,
  stringToBytes,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import type { CkbCellCreatedEventV1 } from "ckb-multichain-connector";

export type RelayPayload = {
  schemaVersion: number;
  sourceNetwork: Hex;
  blockHeight: bigint;
  blockHash: Hex;
  eventId: Hex;
  transactionHash: Hex;
  outputIndex: number;
  eventData: Hex;
};

export const relayAbi = [
  {
    type: "function", name: "relay", stateMutability: "nonpayable",
    inputs: [{ name: "payload", type: "tuple", components: [
      { name: "schemaVersion", type: "uint16" },
      { name: "sourceNetwork", type: "bytes32" },
      { name: "blockHeight", type: "uint256" },
      { name: "blockHash", type: "bytes32" },
      { name: "eventId", type: "bytes32" },
      { name: "transactionHash", type: "bytes32" },
      { name: "outputIndex", type: "uint32" },
      { name: "eventData", type: "bytes" },
    ] }], outputs: [{ name: "payloadHash", type: "bytes32" }],
  },
  { type: "function", name: "acceptedPayloadHash", stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "authorizedRelayer", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "event", name: "SourceEventAccepted", anonymous: false, inputs: [
    { name: "eventId", type: "bytes32", indexed: true },
    { name: "payloadHash", type: "bytes32", indexed: true },
    { name: "sourceNetwork", type: "bytes32", indexed: true },
    { name: "blockHeight", type: "uint256", indexed: false },
    { name: "blockHash", type: "bytes32", indexed: false },
    { name: "transactionHash", type: "bytes32", indexed: false },
    { name: "outputIndex", type: "uint32", indexed: false },
    { name: "eventData", type: "bytes", indexed: false },
  ] },
] as const;

export function normalizeCkbEvent(event: CkbCellCreatedEventV1): RelayPayload {
  const outputIndex = Number(event.cell.outPoint.index);
  const blockHeight = BigInt(event.source.blockHeight);
  if (!Number.isSafeInteger(outputIndex) || outputIndex < 0 || outputIndex > 0xffff_ffff) {
    throw new Error("CKB output index is outside uint32 range.");
  }
  if (blockHeight < 0n || blockHeight > (1n << 256n) - 1n) {
    throw new Error("CKB block height is outside uint256 range.");
  }
  // Fixed field order makes the serialized event data stable across runs.
  const canonicalData = stableStringify({
    schemaVersion: 1,
    eventId: event.eventId,
    source: event.source,
    cell: event.cell,
    observation: event.observation,
  });
  return {
    schemaVersion: 1,
    sourceNetwork: keccak256(stringToBytes(`ckb:${event.source.genesisBlockHash.toLowerCase()}`)),
    blockHeight,
    blockHash: event.source.blockHash,
    eventId: keccak256(stringToBytes(event.eventId)),
    transactionHash: event.source.transactionHash,
    outputIndex,
    eventData: `0x${Buffer.from(canonicalData, "utf8").toString("hex")}` as Hex,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function relayPayloadHash(payload: RelayPayload, chainId: bigint, contract: Address): Hex {
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint16" }, { type: "uint256" }, { type: "address" },
      { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" },
      { type: "bytes32" }, { type: "uint32" }, { type: "bytes32" },
    ],
    [
      keccak256(stringToBytes("EffectStream CKB Event Relay")), payload.schemaVersion,
      chainId, contract, payload.sourceNetwork, payload.blockHeight, payload.blockHash,
      payload.eventId, payload.transactionHash, payload.outputIndex,
      keccak256(toBytes(payload.eventData)),
    ],
  ));
}
