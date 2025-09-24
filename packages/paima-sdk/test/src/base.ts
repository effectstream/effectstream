import { ConfigPrimitivePayloadType, ConfigPrimitiveType } from "@paima/config";
import { type TIntersect, type TObject, type TSchema } from "@sinclair/typebox";
import type { BlockNumber } from "@paima/utils";

export interface EvmPrimitive<Data extends PrimitiveData> {
  data: Data;
  fetchData: () => void; // TODO
  createViews: () => void;
  createScheduledData: (
    paima_block_height: BlockNumber,
    payload: Data["payloadType"],
  ) => void;
}

export type BasePrimitivePayloadType = {
  type: ConfigPrimitivePayloadType;
  payload: TObject;
};
export abstract class BasePrimitive<
  Data extends { payloadType: BasePrimitivePayloadType },
> {
  abstract fetchData(): void; // TODO
  createViews(): void {}
  abstract createScheduledData(
    paima_block_height: BlockNumber,
    payload: Data["payloadType"],
  ): void;
}

export interface PrimitiveData {
  readonly payloadType: BasePrimitivePayloadType;
  readonly schema: {
    required: TIntersect<any>;
    optional: TIntersect<any>;
  };
  readonly primitiveType: ConfigPrimitiveType;
  readonly transitions: Record<string, [string, TSchema][]>;
}
