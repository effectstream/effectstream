import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PaimaL2ContractModule", (m) => {
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("MyPaimaL2Contract", [owner, fee]);
  return { contract };
});
