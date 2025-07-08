import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PaimaL2ContractModule", (m) => {
  const account = m.getAccount(5);
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("PaimaL2Contract", [owner, fee], {
    id: "PaimaL2ContractModule",
    from: account,
  });
  return { contract };
});
