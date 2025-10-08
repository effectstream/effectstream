import { PrimitiveTypeMidnightGeneric, PrimitiveTypeEVMPaimaL2, PrimitiveTypeEVMERC721, PrimitiveTypeEVMERC20, PrimitiveTypeAvailGeneric } from "./builtin.ts";

import { MidnightGenericPrimitive } from "./midnight-generic/midnight-genetic.ts";
import { PaimaL2Primitive } from "./evm-paimal2/paimal2-primitive.ts";
import { Erc721Primitive } from "./evm-erc721/erc721-primitive.ts";
import { Erc20Primitive } from "./evm-erc20/erc20-primitive.ts";
import { AvailGenericPrimitive } from "./avail-generic/avail-primitive.ts";

const builtInPrimitivesMap = { 
    [PrimitiveTypeMidnightGeneric]: MidnightGenericPrimitive,
    [PrimitiveTypeEVMPaimaL2]: PaimaL2Primitive,
    [PrimitiveTypeEVMERC721]: Erc721Primitive,
    [PrimitiveTypeEVMERC20]: Erc20Primitive,
    [PrimitiveTypeAvailGeneric]: AvailGenericPrimitive,
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
};