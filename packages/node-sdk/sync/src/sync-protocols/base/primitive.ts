import type { Operation } from "effection";
import type { PageRequest } from "./page.ts";

export interface PrimitiveFetcher<
  Input,
  Page extends number | string,
  RawData,
  PrimitiveType,
> {
  readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, RawData>,
  ): Operation<PrimitiveType[]>;

  groupByPage(primitives: PrimitiveType[]): Record<Page, PrimitiveType[]>;
}
