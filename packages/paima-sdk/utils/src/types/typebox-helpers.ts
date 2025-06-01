import { FormatRegistry, Kind, Type } from "@sinclair/typebox";
import type {
  NumberOptions,
  RegExpOptions,
  SchemaOptions,
  Static,
  StaticDecode,
  TNull,
  TObject,
  TRegExp,
  TSchema,
  TString,
  TTransform,
  TUnion,
} from "@sinclair/typebox";
import { Value, ValueErrorType } from "@sinclair/typebox/value";
import type { AbiEvent } from "abitype";
import type { Mutable, Satisfies, TypeErrorMessage } from "./misc.ts";
import type * as Nominal from "./nominal.ts";
import * as ss58 from "@subsquid/ss58-codec";
import bs58check from "bs58check";
import { bech32 } from "bech32";
import {
  verifyAlgorandAddress,
  verifyAlgorandBlockHash,
  verifyAlgorandTransactionHash,
} from "./validators/algorand.ts";
import {
  verifyMinaAddress,
  verifyMinaBlockHash,
  verifyMinaTransactionHash,
} from "./validators/mina.ts";
import {
  verifyCardanoByronAddress,
  verifyCardanoShelleyAddress,
} from "./validators/cardano.ts";

export type MaybeStaticDecode<T extends never | TSchema> = T extends TSchema
  ? StaticDecode<T>
  : never;

export enum AddressType {
  EVM = 0,
  CARDANO = 1,
  SUBSTRATE = 2,
  ALGORAND = 3,
  MINA = 4,
  MIDNIGHT = 5,
  AVAIL = 6,
}

function tryDecode<T>(
  val: string,
  validator: (address: string) => T,
  checkResult: (result: T) => boolean = () => true,
): boolean {
  try {
    return checkResult(validator(val));
  } catch (e) {
    return false;
  }
}
FormatRegistry.Set(
  "algorand-address",
  (val) => tryDecode(val, verifyAlgorandAddress),
);
FormatRegistry.Set(
  "algorand-blockhash",
  (val) => tryDecode(val, verifyAlgorandBlockHash),
);
FormatRegistry.Set(
  "algorand-txid",
  (val) => tryDecode(val, verifyAlgorandTransactionHash),
);
FormatRegistry.Set("mina-address", (val) => tryDecode(val, verifyMinaAddress));
FormatRegistry.Set(
  "mina-blockhash",
  (val) => tryDecode(val, verifyMinaBlockHash),
);
FormatRegistry.Set(
  "mina-txid",
  (val) => tryDecode(val, verifyMinaTransactionHash),
);
FormatRegistry.Set(
  "cardano-address",
  (val) =>
    tryDecode(val, verifyCardanoByronAddress) ||
    tryDecode(val, verifyCardanoShelleyAddress),
);
FormatRegistry.Set("ss58", (val) => tryDecode(val, ss58.decode));
FormatRegistry.Set("bs58check", (val) => tryDecode(val, bs58check.decode));
FormatRegistry.Set("bech32", (val) =>
  // note: increase max bech32 limit since some cryptocurrencies need it
  tryDecode(val, (val) => bech32.decode(val, Number.MAX_SAFE_INTEGER / 2)));

function forceLowercase<T extends TString | TRegExp>(schema: T): TTransform<T> {
  return Type.Transform(schema)
    .Decode((value) => (value as any).toLowerCase())
    .Encode((value) => value.toLowerCase());
}
function forceUppercase<T extends TString | TRegExp>(schema: T): TTransform<T> {
  return Type.Transform(schema)
    .Decode((value) => (value as any).toUpperCase())
    .Encode((value) => value.toUpperCase());
}
export const TypeboxHelpers = {
  Uint256: Type.Transform(Type.BigInt({
    maximum:
      115792089237316195423570985008687907853269984665640564039457584007913129639935n,
    minimum: 0n,
  }))
    .Decode((value) => value.toString())
    .Encode((value) => BigInt(value)),
  BlockNumber: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.BlockNumber>(Type.Number(options)),
  AbsoluteSlotNumber: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.AbsoluteSlotNumber>(Type.Number(options)),
  EpochNumber: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.EpochNumber>(Type.Number(options)),
  Algorand: {
    BlockHash: Type.Unsafe<Nominal.AlgorandBlockHash>(
      Type.String({ format: "algorand-blockhash" }),
    ),
    TxHash: Type.Unsafe<Nominal.AlgorandTxHash>(
      forceUppercase(Type.String({ format: "algorand-txid" })),
    ),
    Address: Type.Unsafe<Nominal.AlgorandAddress>(
      forceUppercase(Type.String({ format: "algorand-address" })),
    ),
  },
  Substrate: {
    Address: Type.Unsafe<Nominal.SubstrateAddress>(
      Type.String({ format: "ss58" }),
    ),
  },
  Avail: {
    BlockHash: Type.Unsafe<Nominal.AvailBlockHash>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
    Address: Type.Unsafe<Nominal.AvailAddress>(Type.String({ format: "ss58" })),
    // recall: no good concept of tx hash on Substrate chains
  },
  Cardano: {
    BlockHash: Type.Unsafe<Nominal.CardanoBlockHash>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{64}$/)),
    ),
    TxHash: Type.Unsafe<Nominal.CardanoTxHash>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{64}$/)),
    ),
    // TODO: this fails on Byron-era addresses
    Address: Type.Unsafe<Nominal.CardanoAddress>(
      Type.String({ format: "cardano-address" }),
    ),
    Credential: Type.Unsafe<Nominal.CardanoCredential>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{64}$/)),
    ),
    // TODO: there are two common poolIDs. regex, and poolID bech32
    PoolId: Type.Unsafe<Nominal.CardanoPoolId>(forceLowercase(Type.String())),
    PolicyId: Type.Unsafe<Nominal.CardanoPolicyId>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{56}$/)),
    ),
    AssetName: Type.Unsafe<Nominal.CardanoAssetName>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{64}$/)),
    ),
    // TODO: bech32
    Cip14Fingerprint: Type.Unsafe<Nominal.CardanoCip14Fingerprint>(
      Type.String(),
    ),
    AmountLovelace: Type.Unsafe<Nominal.CardanoAmountLovelace>(
      Type.RegExp(/^\d+$/),
    ),
  },
  Evm: {
    BlockHash: Type.Unsafe<Nominal.EvmBlockHash>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
    TxHash: Type.Unsafe<Nominal.EvmTxHash>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
    Address: Type.Unsafe<Nominal.EvmAddress>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{40}$/)),
    ),
    Selector: Type.Unsafe<Nominal.Evm4ByteSelector>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{8}$/)),
    ),
    FullSelector: Type.Unsafe<Nominal.EvmSelector>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
  },
  Midnight: {
    BlockHash: Type.Unsafe<Nominal.MidnightBlockHash>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
    TxHash: Type.Unsafe<Nominal.MidnightTxHash>(
      forceLowercase(Type.RegExp(/^0x[a-fA-F0-9]{64}$/)),
    ),
    Address: Type.Unsafe<Nominal.MidnightAddress>(
      forceLowercase(Type.RegExp(/^[a-fA-F0-9]{181}$/)),
    ),
  },
  Mina: {
    BlockHash: Type.Unsafe<Nominal.MinaBlockHash>(
      Type.String({ format: "mina-blockhash" }),
    ),
    TxHash: Type.Unsafe<Nominal.MinaTxHash>(
      Type.String({ format: "mina-txid" }),
    ),
    Address: Type.Unsafe<Nominal.MinaAddress>(
      Type.String({ format: "mina-address" }),
    ),
  },
  Caip2: Type.Unsafe<Nominal.Caip2>(Type.String()),
  WalletAddress: () =>
    Type.Union(AddressTypebox as Mutable<typeof AddressTypebox>),
  IntervalMs: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.IntervalMs>(Type.Number(options)),
  IntervalSec: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.IntervalSec>(Type.Number(options)),
  TimestampMs: (options?: NumberOptions) =>
    Type.Unsafe<Nominal.TimestampMs>(Type.Number(options)),
  TimestampMsStr: Type.Unsafe<Nominal.TimestampMsStr>(Type.RegExp(/^\d+$/)),
  HexString0x: (options?: RegExpOptions) =>
    Type.Unsafe<Nominal.HexString0x>(Type.RegExp(/^0x[a-fA-F0-9]+$/, options)),
  HexStringNo0x: (options?: RegExpOptions) =>
    Type.Unsafe<Nominal.HexStringNo0x>(Type.RegExp(/^[a-fA-F0-9]+$/, options)),
  UnknownFormat: Type.Unsafe<Nominal.UnknownFormat>(Type.String()),
  Lowercase: forceLowercase(Type.String()),
  TrueOrFalse: Type.Transform(
    Type.Union([Type.Literal("T"), Type.Literal("F")]),
  )
    .Decode((value) => value === "T")
    .Encode((value) => (value ? "T" : "F")),
  Nullable: <T extends TSchema>(
    schema: T,
    options?: SchemaOptions,
  ): TUnion<[T, TNull]> => Type.Union([schema, Type.Null()], options),
  JsonUnsafeCast: <
    T,
    StringSchema extends TSchema & { [Kind]: string } = TString,
  >(
    schema: StringSchema,
  ): TTransform<StringSchema, T> =>
    Type.Transform(schema)
      .Decode((x) => JSON.parse(x as string) as T)
      .Encode((x: T) => JSON.stringify(x) as Static<StringSchema>),
  // TODO: maybe improve with a typebox-specific EVM ABI wrapper
  //       abitype library comes with a ZOD verifier, and that can be ported to typebox
  EvmAbiEvent: Type.Unsafe<AbiEvent>(Type.Any()),
};

export const AddressValidator = {
  [AddressType.EVM]: TypeboxHelpers.Evm.Address,
  [AddressType.CARDANO]: TypeboxHelpers.Cardano.Address,
  [AddressType.SUBSTRATE]: TypeboxHelpers.Substrate.Address,
  [AddressType.AVAIL]: TypeboxHelpers.Avail.Address,
  [AddressType.ALGORAND]: TypeboxHelpers.Algorand.Address,
  [AddressType.MINA]: TypeboxHelpers.Mina.Address,
  [AddressType.MIDNIGHT]: TypeboxHelpers.Midnight.Address,
} as const satisfies Record<AddressType, TSchema>;
export const AddressTypebox = [
  Type.Object({
    type: Type.Literal(AddressType.EVM),
    address: TypeboxHelpers.Evm.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.CARDANO),
    address: TypeboxHelpers.Cardano.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.SUBSTRATE),
    address: TypeboxHelpers.Substrate.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.AVAIL),
    address: TypeboxHelpers.Avail.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.ALGORAND),
    address: TypeboxHelpers.Algorand.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.MINA),
    address: TypeboxHelpers.Mina.Address,
  }),
  Type.Object({
    type: Type.Literal(AddressType.MIDNIGHT),
    address: TypeboxHelpers.Midnight.Address,
  }),
] as const;
true satisfies Satisfies<
  [(typeof AddressTypebox)[number]["static"]["type"]],
  [AddressType]
>;

type AddressTypeMap = {
  [K in keyof typeof AddressValidator]: StaticDecode<
    (typeof AddressValidator)[K]
  >;
};
export type AddressAndType = {
  [K in keyof AddressTypeMap]: {
    type: K;
    address: AddressTypeMap[K];
  };
}[keyof AddressTypeMap];

export function checkOrError<T extends TSchema>(
  name: string | undefined,
  structure: T,
  config: unknown,
): StaticDecode<T> {
  // 1) Check if there are any errors since Value.Decode doesn't give error messages
  {
    const errors = Array.from(Value.Errors(structure, config)).filter(
      // there are many useless errors in this library
      // ex: 1st error: "foo" should be "bar" in struct Foo
      //     2nd error: struct Foo is invalid inside struct Config
      //     in this case, the 2nd error is useless as we only care about the 1st error
      // However, we always want to show the error if for some reason it's the only error
      (error) =>
        error.type !== ValueErrorType.Intersect &&
        error.type !== ValueErrorType.Union,
    );

    for (const error of errors) {
      console.error({
        name: name ?? "Schema root",
        path: error.path,
        valueProvided: error.value,
        message: error.message,
      });
    }
    if (errors.length > 1) {
      throw new Error(`Schema field missing or invalid. See above for error.`);
    }
  }

  const decoded = Value.Decode(structure, config);
  return decoded;
}

type TObjectToTuple<
  Obj extends TObject<any>,
  Keys extends (keyof Obj["properties"])[],
> = {
  [K in keyof Keys]: [
    Keys[K],
    Obj extends TObject<Record<Keys[K] & string, infer V extends TSchema>> ? V
      : never,
  ];
};
export function pick<const Keys extends string[]>(
  keys: Keys,
): {
  from: <Obj extends TObject<Record<Keys[number], any>>>(
    obj: Obj,
  ) => TObjectToTuple<Obj, Keys>;
} {
  return {
    from: (obj) => {
      const result = [];
      for (const key of keys) {
        result.push([key, (obj.properties as any)[key]]);
      }
      return result as any;
    },
  };
}

type HasAllProperties<
  T extends TObject<any>,
  K extends string[],
> = keyof T["properties"] extends K[number] ? T
  : TypeErrorMessage<
    `Missing properties: ${string & Exclude<keyof T["properties"], K[number]>}`
  >;

/**
 * Same as `pick`, but requires that you include ALL properties and not just a subset of them
 */
export function pickAll<const Keys extends string[]>(
  keys: Keys,
): {
  from: <Obj extends TObject<Record<Keys[number], any>>>(
    obj: HasAllProperties<Obj, Keys>,
  ) => TObjectToTuple<Obj, Keys>;
} {
  return {
    from: (obj) => pick(keys).from(obj as any),
  };
}
