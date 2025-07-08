import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Erc20DevModule", (m) => {
  const account = m.getAccount(5);
  const contract = m.contract("Erc20Dev", [], {
    id: "Erc20DevModule",
    from: account,
  });
  m.call(contract, "mint", [account, 100]);
  m.call(contract, "getBalance2", [account]);
  return { contract };
});
