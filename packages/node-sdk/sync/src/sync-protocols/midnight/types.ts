import type {
  BlockNumber,
  MidnightAddress,
  MidnightBlockHash,
  MidnightTxHash,
  TimestampIso8601,
  TimestampMs,
} from "@paima/utils";
import type { ExecutionResult } from "npm:graphql-ws";
import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";

export type CommonFunnelArgs = {
  /**
   * TODO: right now the Midnight funnels works in an odd way
   *       where we fetch every single block in one large graphql query
   *       then parse into it as needed
   *       Not clear this is the best approach
   */
  block: CachedBlock;
  fromBlock: BlockNumber;
  toBlock: BlockNumber;
  toMainchainBlockNumber?: (block: BlockNumber) => BlockNumber;
  toMainchainTimestamp?: (block: BlockNumber) => TimestampMs;
  isPresync: boolean;
};

// =============
// Graphql Block
// =============

// Interfaces approximated from GraphQL schema served by indexer v1.3.1

interface ContractCallOrDeploy {
  address: MidnightAddress;
  state: string;
  transaction: Transaction;
  zswapChainState: string;
}

interface ContractCall extends ContractCallOrDeploy {
  deploy: ContractCallOrDeploy;
  operation: string;
}

interface ContractDeploy extends ContractCallOrDeploy {
  definition: string;
}

interface Transaction {
  block: Block;
  hash: MidnightTxHash;
  identifiers: string[];
  contractCalls: (ContractCall | ContractDeploy)[];
  raw: string;
  applyStage: string;
  merkleTreeRoot?: string;
}

export interface Block {
  parent?: Block;
  hash: MidnightBlockHash;
  height: BlockNumber;
  timestamp: TimestampIso8601;
  transactions: Transaction[];
}

export type CachedBlock = Pick<Block, "height" | "hash" | "timestamp"> & {
  transactions: (Pick<Transaction, "hash"> & {
    contractCalls: Pick<ContractCall, "address" | "state">[];
  })[];
};

// ================
// GraphQL handling
// ================

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

// TODO: Move this to a midnight client file
export async function gqlQuery(url: string, query: string): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      query,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    // GraphQL syntax errors etc. are 200s, this could be a 503 or similar
    console.error(`Failed to fetch ${url}`);
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

export function handleGqlWsError<T>(
  ex: IteratorResult<ExecutionResult<T, unknown>, unknown>,
): T {
  if (ex.done) throw new GraphQLError("Subscription ended");
  if (ex.value.errors) {
    throw new GraphQLError("Subscription errored", ex.value.errors);
  }
  if (!ex.value.data) throw new GraphQLError("Server returned nothing");
  return ex.value.data;
}

import type { PageRelation } from "../base/page.ts";
import type { PageSyncRange } from "../common/page-helpers.ts";

export type Page = {
  height: BlockNumber;
  hash: MidnightBlockHash;
};

export type PrimitiveType = FlattenSyncProtocolIOFor<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  ConfigPrimitiveType.MidnightContractState,
  ConfigPrimitivePayloadType.Event
>;
export type Input = PageSyncRange<BlockNumber>;
export type Output = {
  raw: Block;
  primitives: PrimitiveType[];
};

export const pageRelation: PageRelation<Page> = {
  compare: (p1, p2) => p1.height - p2.height,
  equals: (p1, p2) => p1.height === p2.height,
  min: (p1, p2) => (p1.height < p2.height ? p1 : p2),
  max: (p1, p2) => (p1.height > p2.height ? p1 : p2),
};
