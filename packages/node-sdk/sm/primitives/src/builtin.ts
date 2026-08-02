// list of built-in primitives
// this list is exposed to the effectstream-sdk modules via the @effectstream/sm/builtin module
import {
  SOLANA_PRIMITIVE_ACCOUNT_BALANCE,
  SOLANA_PRIMITIVE_PROGRAM_LOG,
  SOLANA_PRIMITIVE_TOKEN_ACCOUNT,
} from "@effectstream/config";

export const PrimitiveTypeMidnightGeneric = "Midnight:Generic" as const;
export const PrimitiveTypeMidnightNullifier = "Midnight:Nullifier" as const;
export const PrimitiveTypeMidnightUnshieldedSpend = "Midnight:UnshieldedSpend" as const;
export const PrimitiveTypeMidnightUnshieldedCreate = "Midnight:UnshieldedCreate" as const;
export const PrimitiveTypeMidnightZswapRoot = "Midnight:ZswapRoot" as const;
export const PrimitiveTypeMidnightTokenMint = "Midnight:TokenMint" as const;

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

// Solana's discriminators are defined in @effectstream/config, beside the
// `SolanaPrimitive` type they discriminate, because the sync fetcher dispatches on
// them and @effectstream/sync does not depend on @effectstream/sm. Re-exported here
// under the PrimitiveType* names so consumers keep importing them from
// @effectstream/sm/builtin like every other primitive.
// Aliased through local consts rather than `export { X as Y } from`, because the
// `BuiltInPrimitives` union below needs `typeof PrimitiveTypeSolana*` in scope and a
// bare re-export does not bind the name locally.
export const PrimitiveTypeSolanaProgramLog = SOLANA_PRIMITIVE_PROGRAM_LOG;
export const PrimitiveTypeSolanaAccountBalance = SOLANA_PRIMITIVE_ACCOUNT_BALANCE;
export const PrimitiveTypeSolanaTokenAccount = SOLANA_PRIMITIVE_TOKEN_ACCOUNT;

type BuiltInPrimitives =
    typeof PrimitiveTypeMidnightGeneric |
    typeof PrimitiveTypeMidnightNullifier |
    typeof PrimitiveTypeMidnightUnshieldedSpend |
    typeof PrimitiveTypeMidnightUnshieldedCreate |
    typeof PrimitiveTypeMidnightZswapRoot |
    typeof PrimitiveTypeMidnightTokenMint |
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
    typeof PrimitiveTypeSolanaProgramLog |
    typeof PrimitiveTypeSolanaAccountBalance |
    typeof PrimitiveTypeSolanaTokenAccount // |
    // typeof PrimitiveTypeEVMGeneric
;

export type AnyPrimitiveType = BuiltInPrimitives | `${string}:${string}`; // Allow user defined primitives