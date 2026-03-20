import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("Erc1155DevModule", (m) => {
  const contract = m.contract("ERC1155Dev", []);
  return { contract };
});
