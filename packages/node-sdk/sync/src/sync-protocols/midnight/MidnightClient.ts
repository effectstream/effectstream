import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
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
      }[];
    }[];
  };
};

export interface BlockFetchOptions {
  /** Include contractActions in the transaction fields (needed for MidnightGenericPrimitive). Default: true */
  contractActions?: boolean;
  /** Include zswapLedgerEvents in the transaction fields (needed for MidnightNullifierPrimitive). Default: true */
  zswapLedgerEvents?: boolean;
  /** Include unshieldedSpentOutputs (needed for MidnightUnshieldedSpendPrimitive). Default: false */
  unshieldedSpentOutputs?: boolean;
}

type PublicDataProvider = ReturnType<typeof indexerPublicDataProvider>;
export class MidnightClient {
  private readonly queryURL: string;
  private readonly subscriptionURL: string;
  private publicDataProvider: PublicDataProvider;
  private readonly networkId?: string;
  /** Timeout in milliseconds for individual HTTP requests to the indexer. */
  private readonly requestTimeoutMs: number;

  constructor(queryURL: string, subscriptionURL: string, networkId?: string, requestTimeoutMs = 30_000) {
    this.queryURL = queryURL;
    this.subscriptionURL = subscriptionURL;
    this.networkId = networkId;
    this.requestTimeoutMs = requestTimeoutMs;
    this.publicDataProvider = indexerPublicDataProvider(
      queryURL,
      subscriptionURL,
    );
    console.log(
      `[MidnightClient] Using indexer ${queryURL} (network: ${
        networkId ?? "unknown"
      })`,
    );
  }

  /**
   * Recreate the publicDataProvider to recover from stale internal state.
   * The Midnight JS library can get into a state where all queryContractState
   * calls fail with {"json":{}} until the provider is recreated.
   */
  resetProvider(): void {
    console.log(
      `[MidnightClient] Resetting publicDataProvider for ${this.queryURL}`,
    );
    this.publicDataProvider = indexerPublicDataProvider(
      this.queryURL,
      this.subscriptionURL,
    );
  }

  async fetchContractState(contractAddress: string, blockHeight: number) {
    try {
      const state = await Promise.race([
        this.publicDataProvider.queryContractState(
          contractAddress,
          {
            type: "blockHeight",
            blockHeight,
          },
        ),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`fetchContractState timed out after ${this.requestTimeoutMs}ms (contract=${contractAddress}, height=${blockHeight})`)),
            this.requestTimeoutMs,
          );
        }),
      ]);
      return state;
    } catch (error) {
      // The Midnight JS publicDataProvider can enter a broken state where all
      // subsequent calls fail (e.g. {"json":{}}).  Recreate it so the next
      // retry starts with a fresh connection.
      this.resetProvider();
      throw error;
    }
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
    } = options;
    const contractActionsField = contractActions
      ? `contractActions { address state }`
      : "";
    const zswapField = zswapLedgerEvents
      ? `zswapLedgerEvents { id raw maxId }`
      : "";
    const unshieldedSpentField = unshieldedSpentOutputs
      ? `unshieldedSpentOutputs { intentHash outputIndex owner }`
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
