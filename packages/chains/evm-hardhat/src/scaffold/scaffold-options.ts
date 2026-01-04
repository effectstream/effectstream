import path from "node:path";
import { currentDir } from "./scaffold-helpers.ts";
export const evmContractOptions = [
  {
    label: "ERC-20",
    value: "erc20",
    builtInPrimitive: 'PrimitiveTypeEVMERC20',
    builtInGrammar: 'evmErc20',
    file: path.join(currentDir(), "contract-samples", "ERC20Dev.sol"),
  },
  {
    label: "ERC-721",
    value: "erc721",
    builtInPrimitive: 'PrimitiveTypeEVMERC721',
    builtInGrammar: 'evmErc721',
    file: path.join(currentDir(), "contract-samples", "ERC721Dev.sol"),
  },
  {
    label: "ERC-1155",
    value: "erc1155",
    builtInPrimitive: 'PrimitiveTypeEVMERC1155',
    builtInGrammar: 'evmErc1155',
    file: path.join(currentDir(), "contract-samples", "ERC1155Dev.sol"),
  },
  {
    label: "Effect-Stream L2",
    value: "effectstreaml2",
    builtInPrimitive: 'PrimitiveTypeEVMPaimaL2',
    builtInGrammar: '<CUSTOM-GRAMMAR>',
    file: path.join(currentDir(), "contract-samples", "EffectStreamL2Dev.sol"),
  },
  // {
  //   label: "Empty Contract",
  //   value: "emptycontract",
  //   builtInPrimitive: 'PrimitiveTypeEVMGeneric',
  //   builtInGrammar: 'evmGeneric',
  //   file: path.join(currentDir(), "contract-samples", "EmptyContract.sol"),
  // },
];
