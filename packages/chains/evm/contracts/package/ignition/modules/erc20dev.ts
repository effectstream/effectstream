import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Erc20DevModule", (m) => {
  const contract = m.contract("Erc20Dev", []);
  return { contract };
});
