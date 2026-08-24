import type { Block } from "./types.ts";
import type { ExecutionResult } from "graphql-ws/client";

type MidnightGqlBlock = {
  block: Block;
};


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
      protocolVersion: number;
      contractActions: {
        address:    string;
        state:      string;
      }[];
      zswapLedgerEvents?: {
        id:              number;
        raw:             string;
        maxId:           number;
        protocolVersion: number;
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
    } = options;
    const contractActionsField = contractActions
      ? `contractActions { address state }`
      : "";
    const zswapField = zswapLedgerEvents
      ? `zswapLedgerEvents { id raw maxId protocolVersion }`
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
          protocolVersion
          ${contractActionsField}
          ${zswapField}
          ${unshieldedSpentField}
          ${unshieldedCreatedField}
          ${zswapRootFragment}
          ${tokenMintFields}
        }
      }
    }`;
    return await this.gqlQuery(query, signal);
  }

  async fetchLatestBlock() {
    const query = `query {
      block {
        height
      }
    }`;
    return await this.gqlQuery(query);
  }
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
