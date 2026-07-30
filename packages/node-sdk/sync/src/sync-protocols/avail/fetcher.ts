import {
  ConfigSyncProtocolType,
  type PrimitiveEntry,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import { requestTimeoutOf } from "../common/http.ts";
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
import { AvailClient } from "./AvailClient.ts";
import { all, call, type Operation, sleep } from "effection";
import { bound } from "@effectstream/utils";

export class AvailFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: AvailClient;

  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new AvailClient(
      config.syncProtocol.rpc,
      config.syncProtocol.lightClient,
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
    console.log(
      `[Avail] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );

    let lastHeader: Output["raw"] | undefined;
    for (let height = data.from; height <= data.to; height++) {
      let header;
      try {
        header = yield* call(() =>
          this.client.getBlockHeaderFromHeight(height)
        );
      } catch (_e) {
        break;
      }

      lastHeader = header;
      const primitives = yield* this.readPrimitives(
        height,
        header,
        this.config.primitives,
      );

      if (fetchAllBlocks || primitives.length > 0 || height === data.to) {
        outputs.push({
          output: {
            raw: header,
            primitives,
          },
          cleanup: () => {},
        });
      }
    }

    if (!lastHeader) {
      if (!lastPage) {
        throw new Error(
          `Could not fetch any blocks from ${data.from} to ${data.to} and no previous page was found.`,
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
        ownBlockNumber: lastHeader.number,
        own: {
          height: lastHeader.number,
          hash: lastHeader.hash,
        },
        root: rootConversion.toRootPage({
          raw: lastHeader,
          primitives: [],
        }),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    header: Output["raw"],
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.AVAIL_PARALLEL }
    >[],
  ): Operation<PrimitiveType[]> {
    const allOperations: Operation<PrimitiveType | undefined>[] = [];
    for (const primitiveEntry of primitiveEntries) {
      allOperations.push(
        this.fetchData(height, primitiveEntry, header),
      );
    }
    return (yield* all(allOperations)).flat().filter(
      Boolean,
    ) as PrimitiveType[];
  }

  @bound
  *fetchData(
    height: number,
    primitiveEntry: Extract<
      PrimitiveEntry,
      { syncProtocol: ConfigSyncProtocolType.AVAIL_PARALLEL }
    >,
    header: Output["raw"],
  ): Operation<PrimitiveType | undefined> {
    // For now we only read blocks; if the appId appears in the block header
    // we will invoke the data endpoint, but we will not emit a primitive yet.
    const appId = primitiveEntry.primitive.appId;
    if (typeof appId !== "number") return undefined;

    const isPresent = header.extension.app_lookup.index.some((e) =>
      e.appId === appId
    );
    if (!isPresent) return undefined;
    // Read block data for the corresponding height to unblock future parsing.
    // Intentionally ignore the result for now.
    const blockData = yield* call(() =>
      this.client.getBlockDataFromHeight(height)
    );
    // TODO: handle multiple data transactions
    const dataTransaction = blockData.data_transactions.at(0);
    if (!dataTransaction) return undefined;
    // TODO: is always a JSON string?
    const data: string = atob(dataTransaction.data);
    return {
      syncProtocol: {
        name: primitiveEntry.syncProtocol,
        blockNumber: height,
        transactionHash: header.hash,
        contractAddress: primitiveEntry.primitive.applicationKey,
      },
      primitive: primitiveEntry.primitive.name,
      output: {
        payloadType: "avail-app-state",
        payload: {
          inputData: height.toString(),
          inputNonce: "0x", // TODO replace this with something meaningful
          suppliedValue: data,
        },
      },
    };
  }
}
