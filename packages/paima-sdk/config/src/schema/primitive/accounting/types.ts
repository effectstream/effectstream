import type { StaticDecode, TObject, TSchema } from "@sinclair/typebox";

export enum ConfigPrimitiveAccountingPayloadType {
  Transfer = "transfer",
  Delegate = "delegate",
  MintOrBurn = "mint-or-burn",
}

export type PayloadOf<T> = T extends
  TObject<{ payload: infer PayloadType extends TSchema }>
  ? StaticDecode<PayloadType>
  : never;
