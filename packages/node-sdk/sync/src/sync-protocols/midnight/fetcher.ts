import { BaseDataFetcher } from "../base/fetcher.ts";
import type {
  Block,
  ConfigType,
  Input,
  Output,
  Page,
  PrimitiveEntryType,
  PrimitiveType,
} from "./types.ts";
import { all, call, type Operation } from "effection";
import type { DataFetched } from "../base/fetcher.ts";
import type {
  OutputAndCleanup,
  RootConversion,
} from "../base/state.ts";
import type { RootOutput, RootPage } from "../types.ts";
import { bound } from "@effectstream/utils";
import { MidnightClient, type MidnightGqlBlockState } from "./MidnightClient.ts";
import { ContractState } from "@midnight-ntwrk/onchain-runtime";

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: MidnightClient;
  private readonly networkId?: string;
  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    const indexerHttp = config.syncProtocol.indexer;
    const indexerWs =
      (config.syncProtocol as any).indexerWS ??
      (config.syncProtocol as any).indexerWs;
    if (!indexerHttp || !indexerWs) {
      throw new Error(
        `Midnight sync protocol "${
          config.syncProtocol.name
        }" requires both indexer and indexerWS URLs. Received indexer=${
          indexerHttp ?? "undefined"
        }, indexerWS=${indexerWs ?? "undefined"}.`,
      );
    }
    this.networkId = config.network?.networkId ??
      (config.network as any)?.id;
    this.client = new MidnightClient(
      indexerHttp,
      indexerWs,
      this.networkId,
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `[Midnight${this.networkId ? `:${this.networkId}` : ""}] Fetching blocks from ${data.from} to ${data.to}. ${
        data.isPresync ? "[presync]" : ""
      }`,
    );
    for (let height = data.from; height <= data.to; height++) {
      const result: MidnightGqlBlockState = yield* call(() => this.client.fetchBlock(height));
      const primitives = yield* this.readPrimitives(
        height,
        result,
        this.config.primitives,
      );
      outputs.push({
        output: {
          raw: result.block as unknown as Block,
          primitives,
        },
        cleanup: () => {},
      });
    }

    const lastOutput = outputs[outputs.length - 1].output;
    return {
      output: outputs,
      lastPage: {
        ownBlockNumber: lastOutput.raw.height,
        own: {
          height: lastOutput.raw.height,
          hash: lastOutput.raw.hash,
        },
        root: rootConversion.toRootPage(lastOutput),
      },
    };
  }

  @bound
  *readPrimitives(
    height: number,
    block: MidnightGqlBlockState,
    primitiveEntries: PrimitiveEntryType[],
  ): Operation<PrimitiveType[]> {
    const client = this.client;
    const allOperations: Operation<PrimitiveType[]>[] = [];
    for (const primitiveEntry of primitiveEntries) {
        allOperations.push(
          this.fetchContractState(
            height,
            client,
            primitiveEntry,
            block,
          )
        );
    }
    return (yield* all(allOperations)).flat().filter(
      Boolean,
    ) as PrimitiveType[];
  }

  @bound
  *fetchContractState(
    height: number,
    client: MidnightClient,
    primitiveEntry: PrimitiveEntryType,
    block: MidnightGqlBlockState,
  ): Operation<PrimitiveType[]> {
    const contractAddress = primitiveEntry.primitive.contractAddress;
    const blockFinalState = yield* call(() =>
      client.fetchContractState(contractAddress, height)
    );
    // The state returns null if the contract was not called in the block height
    if (!blockFinalState) {
      return [];
    }

    const transactions = block.block.transactions.filter((t) => {
      return (t.contractActions ?? []).some((c) => {
        const longest = Math.max(contractAddress.length, c.address.length);
        // Addresses length can be padded by 0's
        return c.address.padStart(longest, '0') === contractAddress.padStart(longest, '0');
      });
    });


    return transactions.map(t => {
      // TODO: What does it mean if t.contractActions has more than one element?
      const rawState: string = t.contractActions.find((c) => {
        const longest = Math.max(contractAddress.length, c.address.length);
        // Addresses length can be padded by 0's
        return c.address.padStart(longest, '0') === contractAddress.padStart(longest, '0');
      })!.state!;
      const byteState = new Uint8Array(rawState.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const contract = primitiveEntry.primitive.contract;
      let state;
      
      if (this.config.syncProtocol.customStateParser) {
        state = this.config.syncProtocol.customStateParser(contractAddress, byteState);
      }
      
      if (state === undefined) {
        const contractState = ContractState.deserialize(byteState);
        state = contract.ledger(contractState.data.state);
      }

      return {
        syncProtocol: {
          name: primitiveEntry.syncProtocol,
          blockNumber: height,
          transactionHash: t.hash,
          contractAddress: contractAddress,
        },
        primitive: primitiveEntry.primitive.name,
        output: {
          payloadType: "midnight-contract-state",
          payload: state,
        },
      }
    });
  }
}
