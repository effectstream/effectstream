import type { Channel, Operation } from "effection";
import { createChannel } from "effection";
import type { PageRange } from "./page.ts";
import type { OutputAndCleanup, LastPage, RootConversion } from "./state.ts";

export type DataFetched<Output, Page, RootPage> = {
  output: OutputAndCleanup<Output>[];
  lastPage: LastPage<Page, RootPage>;
};

export abstract class BaseDataFetcher<
  Input,
  Output,
  RootOutput,
  Page,
  RootPage,
> {
  producerChannel: Channel<Output, void>;

  constructor(
    readonly name: string,
  ) {
    this.producerChannel = createChannel<Output>();
  }

  abstract readData(
    data: Input,
    rootConversion: RootConversion<Output, RootOutput, RootPage>,
  ): Operation<DataFetched<Output, Page, RootPage>>;
  abstract getLatestPage(knownLastPage: undefined | Page): Operation<Page>;

  // TODO: maybe these three should go in a separate interface
  abstract previousInterval(nextIntervalStart: Page): PageRange<Page>;
  abstract nextInterval(prevIntervalEnd: Page): PageRange<Page>;
  abstract intervalFromStart(start: Page): PageRange<Page>;
}
