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
    }[];
  };
};

type PublicDataProvider = ReturnType<typeof indexerPublicDataProvider>;
export class MidnightClient {
  private readonly queryURL: string;
  private readonly subscriptionURL: string;
  private readonly publicDataProvider: PublicDataProvider;
  private readonly networkId?: string;

  constructor(queryURL: string, subscriptionURL: string, networkId?: string) {
    this.queryURL = queryURL;
    this.subscriptionURL = subscriptionURL;
    this.networkId = networkId;
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

  async fetchContractState(contractAddress: string, blockHeight: number) {
    const state = await this.publicDataProvider.queryContractState(
      contractAddress,
      {
        type: "blockHeight",
        blockHeight,
      },
    );
    return state;
  }

  async gqlQuery(query: string): Promise<any> {
    const response = await fetch(this.queryURL, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: {
        "Content-Type": "application/json",
      },
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

  async fetchBlock(blockHeight: number): Promise<MidnightGqlBlockState> {
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
          contractActions {
            address
            state
          }
        }
      }
    }`;
    return await this.gqlQuery(query);
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
