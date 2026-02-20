import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
} from "@effectstream/config";
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
    this.client = new CelestiaClient(config.network.rpcUrl);
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];

    console.log(
      `[Celestia] Fetching blocks from ${data.from} to ${data.to}.${
        data.isPresync ? " [presync]" : ""
      }`,
    );

    for (let height = data.from; height <= data.to; height++) {
      let extHeader;
      try {
        extHeader = yield* call(() =>
          this.client.getHeaderAtHeight(height)
        );
      } catch (_e) {
        // Likely reached the chain tip; stop here
        break;
      }

      const blockHash = extHeader.commit.block_id.hash;

      const primitives = yield* this.readPrimitives(
        height,
        blockHash,
        this.config.primitives,
      );

      outputs.push({
        output: {
          timestamp: extHeader.header.time,
          height,
          hash: blockHash,
          primitives,
        },
        cleanup: () => {},
      });
    }

    if (outputs.length === 0) {
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

    const lastOutput = outputs[outputs.length - 1].output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.height,
        own: {
          height: lastOutput.height,
          hash: lastOutput.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
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
