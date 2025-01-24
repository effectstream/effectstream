import type { Operation } from "effection";
import { all, lift, sleep } from "effection";
import { retry } from "@paima/utils";
import type { IntervalMs, Json } from "@paima/utils";
import stableStringify from "json-stable-stringify";

export type PageRange<Page> = {
  from: Page;
  to: Page;
};
export interface PageRelation<T> {
  /**
   * -1 → p1 < p2 \
   *  0 → p1 = p2 \
   * +1 → p1 > p2
   */
  compare: (p1: T, p2: T) => number;
  equals: (p1: T, p2: T) => boolean;
  min: (p1: T, p2: T) => T;
  max: (p1: T, p2: T) => T;
}

// ===========================
//   Page request generation
// (shared between primitives)
// ===========================

export type PageRequest<Page, Result> = (page: Page) => Promise<Result>;

export function genImmediatePageRequests<
  Page extends string | number,
  Result,
>(
  pages: Page[],
  fetchPage: (page: Page) => Promise<Result>,
): PageRequest<Page, Result> {
  const fetchedPages = Promise.all(pages.map((page) => fetchPage(page)));
  const result = {} as Record<Page, Promise<Result>>;
  for (let i = 0; i < pages.length; i++) {
    result[pages[i]] = fetchedPages.then((fetched) => fetched[i]);
  }
  return (page: Page) => result[page];
}
export function genOnDemandPageRequests<
  Page extends Json,
  Result,
>(
  fromPage: Page,
  toPage: Page,
  fetchPage: (page: Page) => Promise<Result>,
  pageRelation: PageRelation<Page>,
): PageRequest<Page, Result> {
  const promises = {} as Record<string, Promise<Result>>;
  const pageRequest = async (
    page: Page,
  ): Promise<Result> => {
    if (
      pageRelation.compare(page, fromPage) < 0 ||
      pageRelation.compare(page, toPage) > 0
    ) {
      throw new Error(
        `Block out of range. ${page} not in [${fromPage}, ${toPage}]`,
      );
    }
    const jsonKey: string = stableStringify(page);
    if (promises[jsonKey] != null) {
      return await promises[jsonKey];
    }
    promises[jsonKey] = fetchPage(page);
    return await promises[jsonKey];
  };
  return pageRequest;
}

export function* fetchNewestPage<Page>(
  pageRelation: PageRelation<Page>,
  getLatestPage: () => Operation<Page>,
  knownLastPage: undefined | Page,
  pollingInterval: IntervalMs,
): Operation<Page> {
  return yield* retry<Page>(
    getLatestPage,
    (res) =>
      knownLastPage == null
        ? true
        : pageRelation.compare(res, knownLastPage) > 0,
    () => sleep(pollingInterval),
  );
}
