import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
} from "@effectstream/config";
import { requestTimeoutOf } from "../common/http.ts";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type {
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveType,
} from "./types.ts";
import {
  CelestiaClient,
  celestiaNamespaceToBase64,
} from "./CelestiaClient.ts";
import { all, call, type Operation } from "effection";
import { bound } from "@effectstream/utils";

export class CelestiaFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: CelestiaClient;

  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new CelestiaClient(
      config.network.rpcUrl,
      requestTimeoutOf(config.syncProtocol),
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    const fetchAllBlocks = this.config.primitives.some(
      (p) => p.primitive.getAllBlockHeaders,
    );

    const heights: number[] = [];
    for (let h = data.from; h <= data.to; h++) heights.push(h);

    console.log(
      `[Celestia] Fetching blocks from ${data.from} to ${data.to} (${heights.length} blocks, concurrency=${(this.config.syncProtocol as any).concurrency ?? 1}).${
        data.isPresync ? " [presync]" : ""
      }`,
    );

    const results: (Output | undefined)[] = new Array(heights.length);
    let cursor = 0;
    const concurrency: number = (this.config.syncProtocol as any).concurrency ?? 1;
    const self = this;

    // Each worker pulls the next unstarted height from `cursor` and stores the
    // result at the corresponding index so output order is always height-ascending.
    // The cursor increment is cooperative-race-free in effection: it runs
    // synchronously before the first yield in each worker iteration.
    function* worker(): Operation<void> {
      while (true) {
        const i = cursor++;
        if (i >= heights.length) return;
        const height = heights[i];
        const extHeader = yield* call(() => self.client.getHeaderAtHeight(height));
        const blockHash = extHeader.commit.block_id.hash;
        const primitives = yield* self.readPrimitives(height, blockHash, self.config.primitives);
        results[i] = { timestamp: extHeader.header.time, height, hash: blockHash, primitives };
      }
    }

    if (heights.length > 0) {
      yield* all(
        Array.from({ length: Math.min(concurrency, heights.length) }, () => worker()),
      );
    }

    let lastFetchedOutput: Output | undefined;
    for (let i = 0; i < results.length; i++) {
      const output = results[i];
      if (!output) continue;
      lastFetchedOutput = output;
      if (fetchAllBlocks || output.primitives.length > 0 || output.height === data.to) {
        outputs.push({ output, cleanup: () => {} });
      }
    }

    if (!lastFetchedOutput) {
      if (!lastPage) {
        throw new Error(
          `[Celestia] Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
        );
      }
      return {
        output: [],
        lastPage,
      };
    }

    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastFetchedOutput.height,
        own: {
          height: lastFetchedOutput.height,
          hash: lastFetchedOutput.hash,
        },
        root: rootConversion.toRootPage(lastFetchedOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    blockHash: string,
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.CELESTIA_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    const allOperations: Operation<PrimitiveType[]>[] = primitiveEntries.map(
      (entry) => this.fetchBlobsForPrimitive(height, blockHash, entry),
    );
    const results = yield* all(allOperations);
    return results.flat();
  }

  @bound
  *fetchBlobsForPrimitive(
    height: number,
    blockHash: string,
    primitiveEntry: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.CELESTIA_PARALLEL }
    >,
  ): Operation<PrimitiveType[]> {
    const namespace = primitiveEntry.primitive.namespace;
    const namespaceB64 = celestiaNamespaceToBase64(namespace);

    const blobs = yield* call(() =>
      this.client.getBlobsAtHeight(height, namespaceB64)
    );

    return blobs.map((blob): PrimitiveType => ({
      syncProtocol: {
        name: primitiveEntry.syncProtocol,
        blockNumber: height,
        transactionHash: blockHash,
        contractAddress: namespace,
        logIndex: blob.index,
      },
      primitive: primitiveEntry.primitive.name,
      output: {
        payloadType: "celestia-blob",
        payload: {
          suppliedValue: atob(blob.data),
          namespace,
          commitment: blob.commitment,
          blobIndex: blob.index,
        },
      },
    }));
  }
}
