import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  createSchema,
  PrimitiveConfigBaseEvm,
} from "@paima/config";
import { pickAll } from "@paima/utils";
import { TypeboxHelpers } from "@paima/utils";
import { type Static, Type } from "@sinclair/typebox";
import type { BlockNumber } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { BasePrimitive } from "./base.ts";

const payloadType = {
  type: ConfigPrimitivePayloadType.Transfer,
  payload: Type.Object({
    from: TypeboxHelpers.Evm.Address,
    to: TypeboxHelpers.Evm.Address,
    value: TypeboxHelpers.Uint256,
  }),
};
const PrimitiveDataErc20 = {
  payloadType,
  schema: createSchema({
    base: PrimitiveConfigBaseEvm,
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.EvmRpcERC20),
      contractAddress: TypeboxHelpers.Evm.Address,
    }),
    optional: Type.Object({
      scheduledPrefix: Type.String(),
    }),
  }),
  primitiveType: ConfigPrimitiveType.EvmRpcERC20,
  transitions: {
    transferScheduledPrefix: pickAll(["from", "to", "value"]).from(
      payloadType.payload,
    ),
  },
};

type DataType = typeof PrimitiveDataErc20;
class Erc20Primitive extends BasePrimitive<DataType> {
  config: Static<typeof PrimitiveDataErc20.schema.allProps>;
  data: DataType;

  constructor(
    props: Static<typeof PrimitiveDataErc20.schema.optionalProps>,
  ) {
    super();
    this.data = PrimitiveDataErc20;
    this.config = Value.Default(
      PrimitiveDataErc20.schema.allProps,
      props,
    ) as typeof this.config;
  }
  override createViews = () => {
    // TODO: views for erc20
  };
  fetchData = () => {
  };

  createScheduledData(
    paima_block_height: BlockNumber,
    payload: DataType["payloadType"],
  ): void {
    console.log(paima_block_height, payload);
    // yield* World.resolve(insertPrimitiveAccounting, {
    //   primitive_name: name,
    //   paima_block_height: paima_block_height,
    //   payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    //   payload: clearBigInts(payload) satisfies PayloadOf<
    //     typeof PrimitiveEvmRpcErc20TransferAccounting
    //   >,
    // });
  }
}

declare module "@paima/test" {
  interface SomeGlobalNamespace {
    Erc20Primitive: typeof Erc20Primitive;
  }
}
