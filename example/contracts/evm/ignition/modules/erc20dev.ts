import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PaimaErc20DevModule", (m) => {
  const contract = m.contract("PaimaErc20Dev", []);
  return { contract };
});
