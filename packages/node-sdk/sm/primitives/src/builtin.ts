// list of built-in primitives
// this list is exposed to the effectstream-sdk modules via the @effectstream/sm/builtin module
export const PrimitiveTypeMidnightGeneric = "Midnight:Generic" as const;
export const PrimitiveTypeMidnightNullifier = "Midnight:Nullifier" as const;
export const PrimitiveTypeMidnightUnshieldedSpend = "Midnight:UnshieldedSpend" as const;

export const PrimitiveTypeUtxorpcGeneric = "Utxorpc:Generic" as const;
export const PrimitiveTypeCardanoMintBurn = "Cardano:MintBurn" as const;
export const PrimitiveTypeCardanoTransfer = "Cardano:Transfer" as const;
export const PrimitiveTypeCardanoPoolDelegation = "Cardano:PoolDelegation" as const;
export const PrimitiveTypeCardanoDelayedAsset = "Cardano:DelayedAsset" as const;
export const PrimitiveTypeCardanoProjectedNFT = "Cardano:ProjectedNFT" as const;

export const PrimitiveTypeEVMEffectstreamL2 = "EVM:EffectstreamL2" as const;
export const PrimitiveTypeEVMERC721 = "EVM:ERC721" as const;
export const PrimitiveTypeEVMERC20 = "EVM:ERC20" as const;
export const PrimitiveTypeEVMERC1155 = "EVM:ERC1155" as const;

// No tested
// export const PrimitiveTypeEVMGeneric = "EVM:Generic" as const;

export const PrimitiveTypeAvailGeneric = "AVAIL:Generic" as const;
export const PrimitiveTypeBitcoinAddress = "BITCOIN:Address" as const;
export const PrimitiveTypeCelestiaGeneric = "CELESTIA:Generic" as const;

export const PrimitiveTypeNEARNEP141 = "NEAR:NEP141" as const;
export const PrimitiveTypeNEARNEP171 = "NEAR:NEP171" as const;
export const PrimitiveTypeNEARNEP245 = "NEAR:NEP245" as const;
export const PrimitiveTypeNEARIntent = "NEAR:Intent" as const;
export const PrimitiveTypeNEARGeneric = "NEAR:Generic" as const;
export const PrimitiveTypeNEARAccountWatch = "NEAR:AccountWatch" as const;

export const PrimitiveTypeSolanaProgramLog = "SOLANA:ProgramLog" as const;

type BuiltInPrimitives =
    typeof PrimitiveTypeMidnightGeneric |
    typeof PrimitiveTypeMidnightNullifier |
    typeof PrimitiveTypeMidnightUnshieldedSpend |
    typeof PrimitiveTypeEVMEffectstreamL2 |
    typeof PrimitiveTypeEVMERC721 |
    typeof PrimitiveTypeEVMERC20 |
    typeof PrimitiveTypeAvailGeneric |
    typeof PrimitiveTypeEVMERC1155 |
    typeof PrimitiveTypeUtxorpcGeneric |
    typeof PrimitiveTypeCardanoMintBurn |
    typeof PrimitiveTypeCardanoTransfer |
    typeof PrimitiveTypeCardanoPoolDelegation |
    typeof PrimitiveTypeCardanoDelayedAsset |
    typeof PrimitiveTypeCardanoProjectedNFT |
    typeof PrimitiveTypeBitcoinAddress |
    typeof PrimitiveTypeCelestiaGeneric |
    typeof PrimitiveTypeNEARNEP141 |
    typeof PrimitiveTypeNEARNEP171 |
    typeof PrimitiveTypeNEARNEP245 |
    typeof PrimitiveTypeNEARIntent |
    typeof PrimitiveTypeNEARGeneric |
    typeof PrimitiveTypeNEARAccountWatch |
    typeof PrimitiveTypeSolanaProgramLog // |
    // typeof PrimitiveTypeEVMGeneric
;

export type AnyPrimitiveType = BuiltInPrimitives | `${string}:${string}`; // Allow user defined primitives