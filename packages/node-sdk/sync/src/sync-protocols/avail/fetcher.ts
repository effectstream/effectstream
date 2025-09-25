import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  type PrimitiveEntry,
  type SyncProtocolWithNetwork,
} from "@paima/config";
import { BaseDataFetcher } from "../base/fetcher.ts";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  LastPage,
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import type { Input, Output, Page, PrimitiveType } from "./types.ts";
import { AvailClient } from "./AvailClient.ts";
import { all, call, type Operation, sleep } from "effection";
import { bound } from "@paima/utils";

export class AvailFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: AvailClient;

  constructor(
    readonly config: Extract<
      SyncProtocolWithNetwork,
      { syncProtocolType: ConfigSyncProtocolType.AVAIL_PARALLEL }
    >,
  ) {
    super(config.syncProtocol.name);
    this.client = new AvailClient(
      config.syncProtocol.rpc,
      config.syncProtocol.lightClient,
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
      `[Avail] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    for (let height = data.from; height <= data.to; height++) {
      let header;
      try {
        header = yield* call(() =>
          this.client.getBlockHeaderFromHeight(height)
        );
      } catch (_e) {
        // Likely reached the tip; stop here
        break;
      }

      const primitives = yield* this.readPrimitives(
        height,
        header,
        this.config.primitives,
      );

      outputs.push({
        output: {
          raw: header,
          primitives,
        },
        cleanup: () => {},
      });
    }

    if (outputs.length === 0) {
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

    const lastOutput = outputs[outputs.length - 1].output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.raw.number,
        own: {
          height: lastOutput.raw.number,
          hash: lastOutput.raw.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    header: Output["raw"],
    primitives: PrimitiveEntry<ConfigSyncProtocolType.AVAIL_PARALLEL>[],
  ): Operation<PrimitiveType[]> {
    const allOperations: Operation<PrimitiveType | undefined>[] = [];
    for (const primitive of primitives) {
      allOperations.push(
        this.fetchPaimaL2(height, primitive, header),
      );
    }
    return (yield* all(allOperations)).flat().filter(
      Boolean,
    ) as PrimitiveType[];
  }

  @bound
  *fetchPaimaL2(
    height: number,
    primitive: PrimitiveEntry<ConfigSyncProtocolType.AVAIL_PARALLEL>,
    header: Output["raw"],
  ): Operation<PrimitiveType | undefined> {
    // For now we only read blocks; if the appId appears in the block header
    // we will invoke the data endpoint, but we will not emit a primitive yet.
    const appId = primitive.primitive.appId;
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
      input: primitive.primitive,
      primitiveType: ConfigPrimitiveType.AvailPaimaL2,
      payloadType: ConfigPrimitivePayloadType.Event,
      output: {
        payloadType: ConfigPrimitivePayloadType.Event,
        primitive: ConfigPrimitiveType.AvailPaimaL2,
        payload: {
          inputData: height.toString(),
          inputNonce: "0x", // TODO replace this with something meaningful
          suppliedValue: data,
        },
        syncProtocol: {
          type: ConfigSyncProtocolType.AVAIL_PARALLEL,
          name: this.config.syncProtocol.name,
          payload: {
            primitiveName: primitive.primitive.name,
            caip2: this.config.network.caip2,
            ownChain: {
              blockNumber: height,
            },
            extrinsicIndex: 0,
            mainchain: {
              blockNumber: null,
              timestamp: null,
            },
          },
          internal: {
            transactionHash: header.hash, // TODO replace this with real txHash
          },
        },
      },
    };
  }
}
