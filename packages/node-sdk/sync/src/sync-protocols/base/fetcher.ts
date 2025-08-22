import type { Channel, Operation } from "effection";
import { createChannel } from "effection";
import type { PageRange } from "./page.ts";
import type { LastPage, OutputAndCleanup, RootConversion } from "./state.ts";

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
    // TODO: Search for a better strategy so it's not needed. For now its just for mindnight
    lastPage: LastPage<Page, RootPage> | undefined,
  ): Operation<DataFetched<Output, Page, RootPage>>;
}

/**
 * Useful interface when pagination is done in fixed predictable chunks
 */
export interface PaginatedFetcher<Page> {
  getLatestPage(knownLastPage: undefined | Page): Operation<Page>;

  previousInterval(nextIntervalStart: Page): PageRange<Page>;
  nextInterval(prevIntervalEnd: Page): PageRange<Page>;
  intervalFromStart(start: Page): PageRange<Page>;
}
