import path from "node:path";
import { currentDir } from "./scaffold-helpers.ts";
export const evmContractOptions = [
  {
    label: "ERC-20",
    value: "erc20",
    file: path.join(currentDir(), "contract-samples", "ERC20Dev.sol"),
  },
  {
    label: "ERC-721",
    value: "erc721",
    file: path.join(currentDir(), "contract-samples", "ERC721Dev.sol"),
  },
  {
    label: "ERC-1155",
    value: "erc1155",
    file: path.join(currentDir(), "contract-samples", "ERC1155Dev.sol"),
  },
  {
    label: "Effect-Stream L2",
    value: "effectstreaml2",
    file: path.join(currentDir(), "contract-samples", "EffectStreamL2Dev.sol"),
  },
  {
    label: "Empty Contract",
    value: "emptycontract",
    file: path.join(currentDir(), "contract-samples", "EmptyContract.sol"),
  },
];
