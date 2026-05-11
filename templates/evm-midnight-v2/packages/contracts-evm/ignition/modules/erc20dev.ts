import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("PaimaErc20DevModule", (m) => {
  const contract = m.contract("PaimaErc20Dev", []);
  return { contract };
});
