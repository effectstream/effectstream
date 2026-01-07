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
import type { EncodedStateValue } from "@effectstream/config";
import { ContractState, NetworkId } from '@midnight-ntwrk/onchain-runtime';

export class MidnightFetcher extends BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage
> {
  readonly client: MidnightClient;
  constructor(
    readonly config: ConfigType,
  ) {
    super(config.syncProtocol.name);
    this.client = new MidnightClient(
      config.syncProtocol.indexer,
      config.syncProtocol.indexerWS ?? "ws://127.0.0.1:8088/api/v3/graphql/ws",
    );
  }

  @bound
  override *readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>> {
    const outputs: OutputAndCleanup<Output>[] = [];
    console.log(
      `[Midnight] Fetching blocks from ${data.from} to ${data.to}. ${
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
      const contractState = ContractState.deserialize(byteState, primitiveEntry.primitive.networkId || NetworkId.Undeployed);
      const contract = primitiveEntry.primitive.contract;
      const state = contract.ledger(contractState.data as any);
      const pojoState = JSON.parse(JSON.stringify(
        state,
        (_key, value) => typeof value === "bigint" ? value.toString() : value
      ));
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
          payload: pojoState as unknown as EncodedStateValue,
        },
      }
    });
  }
}
