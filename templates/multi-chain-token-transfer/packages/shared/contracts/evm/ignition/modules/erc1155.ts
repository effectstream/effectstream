import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("Erc1155DevModule", (m) => {
  const contract = m.contract("MCT_ERC1155", []);
  return { contract };
});
