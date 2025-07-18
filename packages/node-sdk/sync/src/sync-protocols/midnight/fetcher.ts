import type { SyncProtocolWithNetwork } from "@paima/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { Input, Output, Page } from "./types.ts";
import { Block, gqlQuery } from "./types.ts";
import type { Operation } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound } from "@paima/utils";
import { ConfigSyncProtocolType } from "@paima/config";
import { call } from "effection";

type MidnightGqlBlock = {
  block: Block;
};

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  private readonly url: string;
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
    >,
  ) {
    super(config.syncProtocol.name);
    this.url = config.syncProtocol.indexer;
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];

    for (let height = data.from; height <= data.to; height++) {
      const query = `query {
  block(offset: { height: ${height} }) {
    hash
    height
    protocolVersion
    timestamp
    parent {
      hash
    }
    transactions {
      hash
    }
  }
}`;
      const result = (yield* call(
        () => gqlQuery(this.url, query),
      )) as MidnightGqlBlock;
      if (!result?.block) {
        // Block not found, we can stop here.
        // This can happen if we are at the tip of the chain.
        break;
      }
      const block = result.block;
      outputs.push({
        output: {
          raw: block,
          primitives: [],
        },
        cleanup: () => {},
      });
    }

    if (outputs.length === 0) {
      if (!lastPage) {
        // This should not happen if we have a start block, but as a fallback:
        throw new Error(
          `Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
        );
      }
      return {
        output: [],
        lastPage: lastPage,
      };
    }

    const lastOutput = outputs[outputs.length - 1].output;

    return {
      output: outputs,
      lastPage: {
        own: {
          height: lastOutput.raw.height,
          hash: lastOutput.raw.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }
}
