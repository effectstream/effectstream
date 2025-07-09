import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Erc721DevModule", (m) => {
  const contract = m.contract("Erc721Dev", []);
  return { contract };
});
