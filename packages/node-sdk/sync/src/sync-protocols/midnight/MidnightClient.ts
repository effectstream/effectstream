import type { Block } from "./types.ts";
import type { ExecutionResult } from "graphql-ws/client";
import type { MidnightContractEventType as ConfigMidnightContractEventType } from "@effectstream/config";

type MidnightGqlBlock = {
  block: Block;
};

export type MidnightContractEventType = ConfigMidnightContractEventType;

export type MidnightContractEventAddress = {
  kind: "user" | "contract";
  value: string;
};

export type MidnightContractEventBase = {
  /** Monotonic indexer event cursor. */
  id: number;
  maxId: number;
  /** Event payload schema version. */
  version: number;
  protocolVersion: number;
  contractAddress: string;
  /** Indexer-internal transaction row id, not the chain transaction hash. */
  transactionId: number;
  transactionHash: string;
  blockHash: string;
  blockHeight: number;
  raw: string;
};

export type MidnightContractEvent =
  | (MidnightContractEventBase & { eventType: "ShieldedSpend"; nullifier: string })
  | (MidnightContractEventBase & {
    eventType: "ShieldedReceive";
    commitment: string;
    ciphertext?: string;
    receivingContractAddress?: string;
  })
  | (MidnightContractEventBase & {
    eventType: "ShieldedMint";
    commitment: string;
    domainSep: string;
    /** u128 value preserved as an exact decimal string. */
    amount?: string;
  })
  | (MidnightContractEventBase & {
    eventType: "ShieldedBurn";
    nullifier: string;
    /** u128 value preserved as an exact decimal string. */
    amount?: string;
  })
  | (MidnightContractEventBase & {
    eventType: "UnshieldedSpend";
    sender: MidnightContractEventAddress;
    domainSep: string;
    tokenType: string;
    /** u128 value preserved as an exact decimal string. */
    amount: string;
  })
  | (MidnightContractEventBase & {
    eventType: "UnshieldedReceive";
    recipient: MidnightContractEventAddress;
    domainSep: string;
    tokenType: string;
    /** u128 value preserved as an exact decimal string. */
    amount: string;
  })
  | (MidnightContractEventBase & {
    eventType: "UnshieldedMint";
    domainSep: string;
    tokenType: string;
    /** u128 value preserved as an exact decimal string. */
    amount: string;
  })
  | (MidnightContractEventBase & {
    eventType: "UnshieldedBurn";
    sender: MidnightContractEventAddress;
    tokenType: string;
    /** u128 value preserved as an exact decimal string. */
    amount: string;
  })
  | (MidnightContractEventBase & { eventType: "Paused" })
  | (MidnightContractEventBase & { eventType: "Unpaused" })
  | (MidnightContractEventBase & { eventType: "Misc"; name: string; payload: string });

export interface ContractEventSelection {
  /** Explicit API-v4 feature gate. */
  apiVersion: 4;
  /** Required emitter address; whole-network event reads are not supported. */
  contractAddress: string;
  /** Omit to select all known event variants for this contract. */
  types?: MidnightContractEventType[];
}

export interface MidnightGqlBlockState {
  block: {
    hash:            string;
    height:          number;
    protocolVersion: number;
    timestamp:       number;
    parent:          {
      hash: string;
    };
    transactions:    {
      hash:            string;
      contractActions: {
        address:    string;
        state:      string;
      }[];
      zswapLedgerEvents?: {
        id:    number;
        raw:   string;
        maxId: number;
      }[];
      unshieldedSpentOutputs?: {
        intentHash:  string;
        outputIndex: number;
        owner:       string;
        /** u128 value as a decimal string */
        value:       string;
        /** hex-encoded serialized token type */
        tokenType:   string;
      }[];
      unshieldedCreatedOutputs?: {
        intentHash:  string;
        outputIndex: number;
        owner:       string;
        /** u128 value as a decimal string */
        value:       string;
        /** hex-encoded serialized token type */
        tokenType:   string;
      }[];
      // Present only on RegularTransaction (selected via inline fragment): the
      // coin-commitment Merkle tree root after this transaction.
      zswapMerkleTreeRoot?: string;
      // Selected only for MidnightTokenMintPrimitive: the serialized
      // transaction bytes (Transaction interface) and the apply result
      // (RegularTransaction only — absent on system transactions).
      raw?: string;
      transactionResult?: {
        status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILURE";
        segments?: { id: number; success: boolean }[] | null;
      };
    }[];
  };
  contractEvents?: MidnightContractEvent[];
};

export interface BlockFetchOptions {
  /** Include contractActions in the transaction fields (needed for MidnightGenericPrimitive). Default: true */
  contractActions?: boolean;
  /** Include zswapLedgerEvents in the transaction fields (needed for MidnightNullifierAndCommitmentPrimitive). Default: true */
  zswapLedgerEvents?: boolean;
  /** Include unshieldedSpentOutputs (needed for MidnightUnshieldedSpendPrimitive). Default: false */
  unshieldedSpentOutputs?: boolean;
  /** Include unshieldedCreatedOutputs (needed for MidnightUnshieldedCreatePrimitive). Default: false */
  unshieldedCreatedOutputs?: boolean;
  /** Include `... on RegularTransaction { zswapMerkleTreeRoot }` (needed for MidnightZswapRootPrimitive). Default: false */
  zswapRoots?: boolean;
  /** Include tx `raw` + `... on RegularTransaction { transactionResult }` (needed for MidnightTokenMintPrimitive). Default: false */
  tokenMints?: boolean;
  /** Opt-in API-v4 contract events for one required emitting contract. Default: disabled/API v3. */
  contractEvents?: ContractEventSelection;
}

export class MidnightClient {
  private readonly queryURL: string;
  private readonly networkId?: string;
  /** Timeout in milliseconds for individual HTTP requests to the indexer. */
  private readonly requestTimeoutMs: number;

  constructor(queryURL: string, networkId?: string, requestTimeoutMs = 30_000) {
    this.queryURL = queryURL;
    this.networkId = networkId;
    this.requestTimeoutMs = requestTimeoutMs;
    console.log(
      `[MidnightClient] Using indexer ${queryURL} (network: ${
        networkId ?? "unknown"
      })`,
    );
  }

  async gqlQuery(query: string, signal?: AbortSignal): Promise<any> {
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const response = await fetch(this.queryURL, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: {
        "Content-Type": "application/json",
      },
      signal: combinedSignal,
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${this.queryURL}`);
      console.error("Query:", JSON.stringify(query));
      console.error("Response:", await response.text());
      throw new GraphQLError(
        `Server returned ${response.status} ${response.statusText}`,
      );
    }

    const body = await response.json();
    if ("errors" in body) {
      throw new GraphQLError(
        "Server returned errors",
        body.errors as GraphQLErrorDetail[],
      );
    }
    if ("data" in body) {
      return body.data;
    }
    throw new GraphQLError("Server returned nothing");
  }

  handleGqlWsError<T>(
    ex: IteratorResult<ExecutionResult<T, unknown>, unknown>,
  ): T {
    if (ex.done) throw new GraphQLError("Subscription ended");
    if (ex.value.errors) {
      throw new GraphQLError("Subscription errored", ex.value.errors);
    }
    if (!ex.value.data) throw new GraphQLError("Server returned nothing");
    return ex.value.data;
  }

  async fetchBlock(
    blockHeight: number,
    options: BlockFetchOptions = {},
    signal?: AbortSignal,
  ): Promise<MidnightGqlBlockState> {
    const {
      contractActions = true,
      zswapLedgerEvents = true,
      unshieldedSpentOutputs = false,
      unshieldedCreatedOutputs = false,
      zswapRoots = false,
      tokenMints = false,
      contractEvents,
    } = options;
    const contractActionsField = contractActions
      ? `contractActions { address state }`
      : "";
    const zswapField = zswapLedgerEvents
      ? `zswapLedgerEvents { id raw maxId }`
      : "";
    const unshieldedSpentField = unshieldedSpentOutputs
      ? `unshieldedSpentOutputs { intentHash outputIndex owner value tokenType }`
      : "";
    const unshieldedCreatedField = unshieldedCreatedOutputs
      ? `unshieldedCreatedOutputs { intentHash outputIndex owner value tokenType }`
      : "";
    // zswapMerkleTreeRoot lives on RegularTransaction, not the Transaction
    // interface, so it must be selected through an inline fragment.
    const zswapRootFragment = zswapRoots
      ? `... on RegularTransaction { zswapMerkleTreeRoot }`
      : "";
    // `raw` is on the Transaction interface; `transactionResult` is
    // RegularTransaction-only (system transactions have neither result nor
    // contract calls, so they are skipped downstream). Duplicate inline
    // fragments merge legally in GraphQL.
    const tokenMintFields = tokenMints
      ? `raw
         ... on RegularTransaction { transactionResult { status segments { id success } } }`
      : "";
    const query = `query {
      block(offset: { height: ${blockHeight} }) {
        hash
        height
        protocolVersion
        timestamp
        parent {
          hash
        }
        transactions {
          hash
          ${contractActionsField}
          ${zswapField}
          ${unshieldedSpentField}
          ${unshieldedCreatedField}
          ${zswapRootFragment}
          ${tokenMintFields}
        }
      }
    }`;
    const queryWithEvents = contractEvents
      ? query.replace(
          /\n    }$/,
          `\n      ${buildContractEventsSelection(blockHeight, contractEvents)}\n    }`,
        )
      : query;
    const data = await this.gqlQuery(queryWithEvents, signal);
    if (!contractEvents) return data;
    if (!Array.isArray(data.contractEvents)) {
      throw new GraphQLError("API v4 response is missing contractEvents");
    }
    return {
      ...data,
      contractEvents: data.contractEvents.map(decodeMidnightContractEvent),
    };
  }

  async fetchLatestBlock() {
    const query = `query {
      block {
        height
      }
    }`;
    return await this.gqlQuery(query);
  }

  async fetchContractEvents(
    blockHeight: number,
    selection: ContractEventSelection,
    signal?: AbortSignal,
  ): Promise<MidnightContractEvent[]> {
    const query = `query {
      ${buildContractEventsSelection(blockHeight, selection)}
    }`;
    const data = await this.gqlQuery(query, signal);
    if (!Array.isArray(data.contractEvents)) {
      throw new GraphQLError("API v4 response is missing contractEvents");
    }
    return data.contractEvents.map(decodeMidnightContractEvent);
  }
}

const CONTRACT_EVENT_TYPENAMES = {
  ShieldedSpendEvent: "ShieldedSpend",
  ShieldedReceiveEvent: "ShieldedReceive",
  ShieldedMintEvent: "ShieldedMint",
  ShieldedBurnEvent: "ShieldedBurn",
  UnshieldedSpendEvent: "UnshieldedSpend",
  UnshieldedReceiveEvent: "UnshieldedReceive",
  UnshieldedMintEvent: "UnshieldedMint",
  UnshieldedBurnEvent: "UnshieldedBurn",
  PausedEvent: "Paused",
  UnpausedEvent: "Unpaused",
  MiscContractEvent: "Misc",
} as const;

const CONTRACT_EVENT_ENUMS: Record<MidnightContractEventType, string> = {
  ShieldedSpend: "SHIELDED_SPEND",
  ShieldedReceive: "SHIELDED_RECEIVE",
  ShieldedMint: "SHIELDED_MINT",
  ShieldedBurn: "SHIELDED_BURN",
  UnshieldedSpend: "UNSHIELDED_SPEND",
  UnshieldedReceive: "UNSHIELDED_RECEIVE",
  UnshieldedMint: "UNSHIELDED_MINT",
  UnshieldedBurn: "UNSHIELDED_BURN",
  Paused: "PAUSED",
  Unpaused: "UNPAUSED",
  Misc: "MISC",
};

function buildContractEventsSelection(
  blockHeight: number,
  selection: ContractEventSelection,
): string {
  if (selection.apiVersion !== 4) {
    throw new Error("Midnight contractEvents requires the explicit API-v4 feature gate");
  }
  const contractAddress = selection.contractAddress?.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(contractAddress ?? "")) {
    throw new Error("Midnight contractEvents requires one 32-byte contract address");
  }
  let types = "";
  if (selection.types) {
    if (selection.types.length === 0) {
      throw new Error("Midnight contractEvents types cannot be empty");
    }
    const enumValues = selection.types.map((type) => {
      const value = CONTRACT_EVENT_ENUMS[type];
      if (!value) throw new Error(`Unsupported Midnight contract event type: ${String(type)}`);
      return value;
    });
    types = ` types: [${enumValues.join(" ")}]`;
  }
  return `contractEvents(filter: {
        contractAddress: "${contractAddress}"
        fromBlock: ${blockHeight}
        toBlock: ${blockHeight}${types}
      }) {
        __typename
        id
        maxId
        version
        protocolVersion
        contractAddress
        transactionId
        raw
        transaction { hash block { hash height } }
        ... on ShieldedSpendEvent { nullifier }
        ... on ShieldedReceiveEvent { commitment ciphertext receivingContractAddress }
        ... on ShieldedMintEvent { commitment domainSep shieldedAmount: amount }
        ... on ShieldedBurnEvent { nullifier shieldedAmount: amount }
        ... on UnshieldedSpendEvent {
          sender { kind userAddress contractAddress }
          domainSep tokenType amount
        }
        ... on UnshieldedReceiveEvent {
          recipient { kind userAddress contractAddress }
          domainSep tokenType amount
        }
        ... on UnshieldedMintEvent { domainSep tokenType amount }
        ... on UnshieldedBurnEvent {
          sender { kind userAddress contractAddress }
          tokenType amount
        }
        ... on MiscContractEvent { name payload }
      }`;
}

export function decodeMidnightContractEvent(value: unknown): MidnightContractEvent {
  const node = eventRecord(value, "contract event");
  const typename = requiredString(node, "__typename", "contract event");
  if (!(typename in CONTRACT_EVENT_TYPENAMES)) {
    throw new Error(`Unsupported Midnight contract event typename: ${typename}`);
  }
  const base = decodeEventBase(node, typename);
  switch (typename) {
    case "ShieldedSpendEvent":
      return { ...base, eventType: "ShieldedSpend", nullifier: requiredString(node, "nullifier", typename) };
    case "ShieldedReceiveEvent":
      return {
        ...base,
        eventType: "ShieldedReceive",
        commitment: requiredString(node, "commitment", typename),
        ciphertext: optionalString(node, "ciphertext", typename),
        receivingContractAddress: optionalString(node, "receivingContractAddress", typename),
      };
    case "ShieldedMintEvent":
      return {
        ...base,
        eventType: "ShieldedMint",
        commitment: requiredString(node, "commitment", typename),
        domainSep: requiredString(node, "domainSep", typename),
        amount: optionalDecimal(node, "shieldedAmount", typename),
      };
    case "ShieldedBurnEvent":
      return {
        ...base,
        eventType: "ShieldedBurn",
        nullifier: requiredString(node, "nullifier", typename),
        amount: optionalDecimal(node, "shieldedAmount", typename),
      };
    case "UnshieldedSpendEvent":
      return {
        ...base,
        eventType: "UnshieldedSpend",
        sender: decodeEventAddress(node.sender, typename, "sender"),
        domainSep: requiredString(node, "domainSep", typename),
        tokenType: requiredString(node, "tokenType", typename),
        amount: requiredDecimal(node, "amount", typename),
      };
    case "UnshieldedReceiveEvent":
      return {
        ...base,
        eventType: "UnshieldedReceive",
        recipient: decodeEventAddress(node.recipient, typename, "recipient"),
        domainSep: requiredString(node, "domainSep", typename),
        tokenType: requiredString(node, "tokenType", typename),
        amount: requiredDecimal(node, "amount", typename),
      };
    case "UnshieldedMintEvent":
      return {
        ...base,
        eventType: "UnshieldedMint",
        domainSep: requiredString(node, "domainSep", typename),
        tokenType: requiredString(node, "tokenType", typename),
        amount: requiredDecimal(node, "amount", typename),
      };
    case "UnshieldedBurnEvent":
      return {
        ...base,
        eventType: "UnshieldedBurn",
        sender: decodeEventAddress(node.sender, typename, "sender"),
        tokenType: requiredString(node, "tokenType", typename),
        amount: requiredDecimal(node, "amount", typename),
      };
    case "PausedEvent":
      return { ...base, eventType: "Paused" };
    case "UnpausedEvent":
      return { ...base, eventType: "Unpaused" };
    case "MiscContractEvent":
      return {
        ...base,
        eventType: "Misc",
        name: requiredString(node, "name", typename),
        payload: requiredString(node, "payload", typename),
      };
    default:
      throw new Error(`Unsupported Midnight contract event typename: ${typename}`);
  }
}

function decodeEventBase(node: Record<string, unknown>, typename: string): MidnightContractEventBase {
  const transaction = eventRecord(node.transaction, `${typename}.transaction`);
  const block = eventRecord(transaction.block, `${typename}.transaction.block`);
  return {
    id: requiredInteger(node, "id", typename),
    maxId: requiredInteger(node, "maxId", typename),
    version: requiredInteger(node, "version", typename),
    protocolVersion: requiredInteger(node, "protocolVersion", typename),
    contractAddress: requiredString(node, "contractAddress", typename),
    transactionId: requiredInteger(node, "transactionId", typename),
    transactionHash: requiredString(transaction, "hash", `${typename}.transaction`),
    blockHash: requiredString(block, "hash", `${typename}.transaction.block`),
    blockHeight: requiredInteger(block, "height", `${typename}.transaction.block`),
    raw: requiredString(node, "raw", typename),
  };
}

function decodeEventAddress(value: unknown, typename: string, field: string): MidnightContractEventAddress {
  const address = eventRecord(value, `${typename}.${field}`);
  const kind = requiredString(address, "kind", `${typename}.${field}`);
  if (kind === "USER") {
    return { kind: "user", value: requiredString(address, "userAddress", `${typename}.${field}`) };
  }
  if (kind === "CONTRACT") {
    return { kind: "contract", value: requiredString(address, "contractAddress", `${typename}.${field}`) };
  }
  throw new Error(`Unsupported Midnight event address kind at ${typename}.${field}: ${kind}`);
}

function eventRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing or malformed Midnight event field: ${path}`);
  }
  return value as Record<string, unknown>;
}

function requiredString(node: Record<string, unknown>, field: string, path: string): string {
  const value = node[field];
  if (typeof value !== "string") throw new Error(`Missing or malformed Midnight event field: ${path}.${field}`);
  return value;
}

function optionalString(node: Record<string, unknown>, field: string, path: string): string | undefined {
  const value = node[field];
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`Malformed Midnight event field: ${path}.${field}`);
  return value;
}

function requiredInteger(node: Record<string, unknown>, field: string, path: string): number {
  const value = node[field];
  if (!Number.isSafeInteger(value)) throw new Error(`Missing or malformed Midnight event field: ${path}.${field}`);
  return value as number;
}

function requiredDecimal(node: Record<string, unknown>, field: string, path: string): string {
  const value = requiredString(node, field, path);
  if (!/^[0-9]+$/.test(value)) throw new Error(`Malformed Midnight decimal field: ${path}.${field}`);
  return value;
}

function optionalDecimal(node: Record<string, unknown>, field: string, path: string): string | undefined {
  const value = optionalString(node, field, path);
  if (value !== undefined && !/^[0-9]+$/.test(value)) {
    throw new Error(`Malformed Midnight decimal field: ${path}.${field}`);
  }
  return value;
}

interface GraphQLErrorDetail {
  message: string;
  locations?: readonly { line: number; column: number }[];
  path?: readonly (string | number)[];
  extensions?: object;
}

class GraphQLError extends Error {
  errors?: readonly GraphQLErrorDetail[];

  constructor(message: string, errors?: readonly GraphQLErrorDetail[]) {
    super(message);
    this.errors = errors;
  }
}
