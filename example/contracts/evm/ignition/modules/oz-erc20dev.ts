import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("OpenZeppelinErc20DevModule", (m) => {
  const contract = m.contract("MyOpenZeppelinErc20Dev", []);
  return { contract };
});
