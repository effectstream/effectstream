import {
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeEVMPaimaL2,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeAvailGeneric,
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeBitcoinAddress,
//   PrimitiveTypeEVMGeneric,
} from "./builtin.ts";

import { MidnightGenericPrimitive } from "./midnight-generic/midnight-genetic.ts";
import { PaimaL2Primitive } from "./evm-paimal2/paimal2-primitive.ts";
import { Erc721Primitive } from "./evm-erc721/erc721-primitive.ts";
import { Erc20Primitive } from "./evm-erc20/erc20-primitive.ts";
import { AvailGenericPrimitive } from "./avail-generic/avail-primitive.ts";
import { Erc1155Primitive } from "./evm-erc1155/erc1155-primitive.ts";
import { BitcoinAddressPrimitive } from "./bitcoin-address/bitcoin-primitive.ts";
// import { EvmGenericPrimitive } from "./evm-generic/evm-generic-primitive.ts";

const builtInPrimitivesMap = {
  [PrimitiveTypeMidnightGeneric]: MidnightGenericPrimitive,
  [PrimitiveTypeEVMPaimaL2]: PaimaL2Primitive,
  [PrimitiveTypeEVMERC721]: Erc721Primitive,
  [PrimitiveTypeEVMERC20]: Erc20Primitive,
  [PrimitiveTypeAvailGeneric]: AvailGenericPrimitive,
  [PrimitiveTypeEVMERC1155]: Erc1155Primitive,
  [PrimitiveTypeBitcoinAddress]: BitcoinAddressPrimitive,
//   [PrimitiveTypeEVMGeneric]: EvmGenericPrimitive,
} as const;

export {
  // Built-in Primitives Map
  builtInPrimitivesMap,

  // Built-in Primitives
  MidnightGenericPrimitive,
  PaimaL2Primitive,
  Erc721Primitive,
  Erc20Primitive,
  AvailGenericPrimitive,
  Erc1155Primitive,
  BitcoinAddressPrimitive,
  // EvmGenericPrimitive,
};
