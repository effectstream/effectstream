import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EffectstreamErc20DevModule", (m) => {
  const contract = m.contract("EffectstreamErc20Dev", []);
  return { contract };
});
