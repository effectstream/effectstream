import type { StaticDecode, TObject, TSchema } from "@sinclair/typebox";

export enum ConfigPrimitiveAccountingPayloadType {
  Transfer = "transfer",
  Delegate = "delegate",
  MintOrBurn = "mint-or-burn",
  ProjectedNft = "projected-nft",
  Registry = "registry",
  Event = "event",
}

export type PayloadOf<T> = T extends
  TObject<{ payload: infer PayloadType extends TSchema }>
  ? StaticDecode<PayloadType>
  : never;
