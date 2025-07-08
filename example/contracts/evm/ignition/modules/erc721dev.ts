import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Erc721DevModule", (m) => {
  const account = m.getAccount(5);
  const contract = m.contract("Erc721Dev", [], {
    id: "Erc721DevModule",
    from: account,
  });
  return { contract };
});
