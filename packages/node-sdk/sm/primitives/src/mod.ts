import {
  PrimitiveTypeMidnightGeneric,
  PrimitiveTypeMidnightNullifier,
  PrimitiveTypeMidnightUnshieldedSpend,
  PrimitiveTypeEVMEffectstreamL2,
  PrimitiveTypeEVMERC721,
  PrimitiveTypeEVMERC20,
  PrimitiveTypeAvailGeneric,
  PrimitiveTypeEVMERC1155,
  PrimitiveTypeBitcoinAddress,
  PrimitiveTypeUtxorpcGeneric,
  PrimitiveTypeCelestiaGeneric,
  PrimitiveTypeNEARNEP141,
  PrimitiveTypeNEARNEP171,
  PrimitiveTypeNEARNEP245,
  PrimitiveTypeNEARIntent,
  PrimitiveTypeNEARGeneric,
  PrimitiveTypeNEARAccountWatch,
  PrimitiveTypeSolanaProgramLog,
  PrimitiveTypeSolanaAccountBalance,
  PrimitiveTypeCardanoMintBurn,
  PrimitiveTypeCardanoTransfer,
  PrimitiveTypeCardanoPoolDelegation,
  PrimitiveTypeCardanoDelayedAsset,
  PrimitiveTypeCardanoProjectedNFT,
//   PrimitiveTypeEVMGeneric,
} from "./builtin.ts";

import { MidnightGenericPrimitive } from "./midnight-generic/midnight-genetic.ts";
import { MidnightNullifierPrimitive } from "./midnight-nullifier/midnight-nullifier.ts";
import { MidnightUnshieldedSpendPrimitive } from "./midnight-unshielded-spend/midnight-unshielded-spend.ts";
import { EffectstreamL2Primitive } from "./evm-effectstream-l2/effectstream-l2-primitive.ts";
import { Erc721Primitive } from "./evm-erc721/erc721-primitive.ts";
import { Erc20Primitive } from "./evm-erc20/erc20-primitive.ts";
import { AvailGenericPrimitive } from "./avail-generic/avail-primitive.ts";
import { Erc1155Primitive } from "./evm-erc1155/erc1155-primitive.ts";
import { BitcoinAddressPrimitive } from "./bitcoin-address/bitcoin-primitive.ts";
import { UtxorpcGenericPrimitive } from "./utxorpc-generic/utxorpc-generic.ts";
import { CelestiaGenericPrimitive } from "./celestia-generic/celestia-primitive.ts";
import { Nep141Primitive } from "./near-nep141/nep141-primitive.ts";
import { Nep171Primitive } from "./near-nep171/nep171-primitive.ts";
import { Nep245Primitive } from "./near-nep245/nep245-primitive.ts";
import { NearIntentPrimitive } from "./near-intent/near-intent-primitive.ts";
import { NearGenericPrimitive } from "./near-generic/near-generic-primitive.ts";
import { NearAccountWatchPrimitive } from "./near-account-watch/near-account-watch-primitive.ts";
import { SolanaProgramLogPrimitive } from "./solana-program-log/solana-program-log-primitive.ts";
import { SolanaAccountBalancePrimitive } from "./solana-account-balance/solana-account-balance-primitive.ts";
import { CardanoMintBurnPrimitive } from "./cardano-mint-burn/mint-burn-primitive.ts";
import { CardanoTransferPrimitive } from "./cardano-transfer/transfer-primitive.ts";
import { CardanoPoolDelegationPrimitive } from "./cardano-pool-delegation/pool-delegation-primitive.ts";
import { CardanoDelayedAssetPrimitive } from "./cardano-delayed-asset/delayed-asset-primitive.ts";
import { CardanoProjectedNftPrimitive } from "./cardano-projected-nft/projected-nft-primitive.ts";
// import { EvmGenericPrimitive } from "./evm-generic/evm-generic-primitive.ts";

const builtInPrimitivesMap = {
  [PrimitiveTypeMidnightGeneric]: MidnightGenericPrimitive,
  [PrimitiveTypeMidnightNullifier]: MidnightNullifierPrimitive,
  [PrimitiveTypeMidnightUnshieldedSpend]: MidnightUnshieldedSpendPrimitive,
  [PrimitiveTypeEVMEffectstreamL2]: EffectstreamL2Primitive,
  [PrimitiveTypeEVMERC721]: Erc721Primitive,
  [PrimitiveTypeEVMERC20]: Erc20Primitive,
  [PrimitiveTypeAvailGeneric]: AvailGenericPrimitive,
  [PrimitiveTypeEVMERC1155]: Erc1155Primitive,
  [PrimitiveTypeBitcoinAddress]: BitcoinAddressPrimitive,
  [PrimitiveTypeUtxorpcGeneric]: UtxorpcGenericPrimitive,
  [PrimitiveTypeCelestiaGeneric]: CelestiaGenericPrimitive,
  [PrimitiveTypeNEARNEP141]: Nep141Primitive,
  [PrimitiveTypeNEARNEP171]: Nep171Primitive,
  [PrimitiveTypeNEARNEP245]: Nep245Primitive,
  [PrimitiveTypeNEARIntent]: NearIntentPrimitive,
  [PrimitiveTypeNEARGeneric]: NearGenericPrimitive,
  [PrimitiveTypeNEARAccountWatch]: NearAccountWatchPrimitive,
  [PrimitiveTypeSolanaProgramLog]: SolanaProgramLogPrimitive,
  [PrimitiveTypeSolanaAccountBalance]: SolanaAccountBalancePrimitive,
  [PrimitiveTypeCardanoMintBurn]: CardanoMintBurnPrimitive,
  [PrimitiveTypeCardanoTransfer]: CardanoTransferPrimitive,
  [PrimitiveTypeCardanoPoolDelegation]: CardanoPoolDelegationPrimitive,
  [PrimitiveTypeCardanoDelayedAsset]: CardanoDelayedAssetPrimitive,
  [PrimitiveTypeCardanoProjectedNFT]: CardanoProjectedNftPrimitive,
//   [PrimitiveTypeEVMGeneric]: EvmGenericPrimitive,
} as const;

export {
  // Built-in Primitives Map
  builtInPrimitivesMap,

  // Built-in Primitives
  MidnightGenericPrimitive,
  MidnightNullifierPrimitive,
  MidnightUnshieldedSpendPrimitive,
  EffectstreamL2Primitive,
  Erc721Primitive,
  Erc20Primitive,
  AvailGenericPrimitive,
  Erc1155Primitive,
  BitcoinAddressPrimitive,
  UtxorpcGenericPrimitive,
  CelestiaGenericPrimitive,
  Nep141Primitive,
  Nep171Primitive,
  Nep245Primitive,
  NearIntentPrimitive,
  NearGenericPrimitive,
  NearAccountWatchPrimitive,
  SolanaProgramLogPrimitive,
  CardanoMintBurnPrimitive,
  CardanoTransferPrimitive,
  CardanoPoolDelegationPrimitive,
  CardanoDelayedAssetPrimitive,
  CardanoProjectedNftPrimitive,
  // EvmGenericPrimitive,
};
