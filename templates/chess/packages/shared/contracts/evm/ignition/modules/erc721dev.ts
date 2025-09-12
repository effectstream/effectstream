import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("Erc721DevModule", (m) => {
  const contract = m.contract("Erc721Dev", []);
  return { contract };
});
