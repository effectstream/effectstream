import type { Operation } from "effection";
import type { PageRequest } from "./page.ts";
import type { ConfigSyncProtocolType, PrimitiveEntry } from "@paima/config";

export interface PrimitiveFetcher<
  Input,
  Page,
  RawData,
  PrimitiveType,
  NetworkType extends ConfigSyncProtocolType,
> {
  readPrimitives(
    data: Input,
    pageRequest: PageRequest<Page, RawData>,
    primitiveEntries: Extract<
      PrimitiveEntry,
      { syncProtocol: NetworkType }
    >[],
  ): Operation<PrimitiveType[]>;

  groupByPage<T extends string>(
    primitives: PrimitiveType[],
  ): Record<T, PrimitiveType[]>;
}
