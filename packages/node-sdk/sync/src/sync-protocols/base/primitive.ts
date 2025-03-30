import type { Operation } from "effection";
import type { PageRequest } from "./page.ts";

export interface PrimitiveFetcher<
  Input,
  Page,
  RawData,
  PrimitiveType,
> {
  readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, RawData>,
  ): Operation<PrimitiveType[]>;

  groupByPage<T extends string>(
    primitives: PrimitiveType[],
  ): Record<T, PrimitiveType[]>;
}
