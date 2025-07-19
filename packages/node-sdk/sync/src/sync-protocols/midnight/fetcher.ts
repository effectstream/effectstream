import type { SyncProtocolWithNetwork } from "@paima/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { Input, Output, Page } from "./types.ts";
import { call, type Operation } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound } from "@paima/utils";
import type { ConfigSyncProtocolType } from "@paima/config";
import { MidnightClient } from "./MidnightClient.ts";

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: MidnightClient;
  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
    >,
  ) {
    super(config.syncProtocol.name);
    this.client = new MidnightClient(
      config.syncProtocol.indexer,
      config.syncProtocol.indexerWS ?? "ws://127.0.0.1:8088/api/v1/graphql/ws",
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `Fetching blocks from ${data.from} to ${data.to}. Presync: ${data.isPresync}`,
    );
    for (let height = data.from; height <= data.to; height++) {
      const result = yield* call(() => this.client.fetchBlock(height));
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
