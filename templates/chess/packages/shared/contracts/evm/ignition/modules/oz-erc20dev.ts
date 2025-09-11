import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("OpenZeppelinErc20DevModule", (m) => {
  const contract = m.contract("MyOpenZeppelinErc20Dev", []);
  return { contract };
});
