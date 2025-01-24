import type {
  StaticDecode,
  TLiteral,
  TObject,
  TSchema,
} from "@sinclair/typebox";
import type { ConfigSyncProtocolType } from "../sync-protocols/types.ts";
import type {
  ConfigPrimitivePayloadType,
  ResponseForSyncProtocol,
} from "./output/types.ts";
import type { KeyedConfigPrimitiveAll } from "./config/all.ts";
import type { IdxOf, MaybeStaticDecode, MergeIntersects } from "@paima/utils";
import type { ConfigPrimitiveType } from "./config/types.ts";

export type SyncProtocolIO<SyncProtocol extends ConfigSyncProtocolType> =
  SyncProtocolToIO<
    ResponseForSyncProtocol<SyncProtocol>
  >;

export type ToKeyedUnion<Arr extends readonly TSchema[]> = {
  [
    K in IdxOf<Arr> as StaticDecode<Arr[K]> extends { type: infer Type }
      ? Type & string
      : never
  ]: Arr[K];
};

type SyncProtocolToIO<U> = U extends
  TObject<{ primitive: TLiteral<infer Primitives> }> ? TObject<{
    input: Primitives extends keyof KeyedConfigPrimitiveAll
      ? KeyedConfigPrimitiveAll[Primitives]
      : never;
    output: U;
  }>
  : never;

/**
 * This is purely because Typescript cannot type-guard nested properties
 * like refining `input` based on `output.primitive`
 * https://github.com/microsoft/TypeScript/pull/38839
 */
export type FlattenSyncProtocolIO<IO> = IO extends {
  input: any;
  output: { primitive: infer Primitive; payloadType: infer PayloadType };
} ? {
    input: IO["input"];
    output: IO["output"];
    primitiveType: Primitive;
    payloadType: PayloadType;
  }
  : never;

export type FlattenSyncProtocolIOFor<
  SyncProtocol extends ConfigSyncProtocolType,
  Primitive extends ConfigPrimitiveType,
  Payload extends ConfigPrimitivePayloadType,
> = Extract<
  FlattenSyncProtocolIO<
    SyncProtocolIO<SyncProtocol> extends infer R extends TSchema
      ? MergeIntersects<MaybeStaticDecode<R>>
      : never
  >,
  {
    primitiveType: Primitive;
    payloadType: Payload;
  }
>;

export function flattenIO<
  const IO extends { input: any; output: { primitive: any; payloadType: any } },
>(
  io: { input: IO["input"]; output: IO["output"] },
): IO & FlattenSyncProtocolIO<IO> {
  return {
    input: io.input,
    output: io.output,
    primitiveType: io.output.primitive,
    payloadType: io.output.payloadType,
  } as IO & FlattenSyncProtocolIO<IO>;
}
