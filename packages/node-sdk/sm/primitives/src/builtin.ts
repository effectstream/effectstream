// list of built-in primitives
// this list is exposed to the effectstream-sdk modules via the @effectstream/sm/builtin module
export const PrimitiveTypeMidnightGeneric = "Midnight:Generic" as const;

export const PrimitiveTypeEVMPaimaL2 = "EVM:PaimaL2" as const;
export const PrimitiveTypeEVMERC721 = "EVM:ERC721" as const;
export const PrimitiveTypeEVMERC20 = "EVM:ERC20" as const;
export const PrimitiveTypeEVMERC1155 = "EVM:ERC1155" as const;

// No tested
// export const PrimitiveTypeEVMGeneric = "EVM:Generic" as const;

export const PrimitiveTypeAvailGeneric = "AVAIL:Generic" as const;

type BuiltInPrimitives = 
    typeof PrimitiveTypeMidnightGeneric | 
    typeof PrimitiveTypeEVMPaimaL2 |
    typeof PrimitiveTypeEVMERC721 |
    typeof PrimitiveTypeEVMERC20 |
    typeof PrimitiveTypeAvailGeneric |
    typeof PrimitiveTypeEVMERC1155 // |
    // typeof PrimitiveTypeEVMGeneric
;

export type AnyPrimitiveType = BuiltInPrimitives | `${string}:${string}`; // Allow user defined primitives