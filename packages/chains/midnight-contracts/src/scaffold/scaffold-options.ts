import { currentDir, joinFile } from "./scaffold-helpers.ts";
export const midnightContractOptions = [
  {
    label: "ERC-20",
    value: "unshielded-erc20",
    file: joinFile(currentDir(), "template", "contract-template", "_contracts", "erc20.compact"),
  },
  // {
  //   label: "ERC-721",
  //   value: "unshielded-erc721",
  //   file: joinFile(currentDir(), "template", "contract-template", "_contracts", "erc721.compact"),
  // },
  // {
  //   label: "ERC-1155",
  //   value: "unshielded-erc1155",
  //   file: joinFile(currentDir(), "template", "contract-template", "_contracts", "erc1155.compact"),
  // },
  // {
  //   label: "Empty Contract",
  //   value: "empty-contract",
  //   file: joinFile(currentDir(), "template", "contract-template", "_contracts", "empty.compact"),
  // },
];
