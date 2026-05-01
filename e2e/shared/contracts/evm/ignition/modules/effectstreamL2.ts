import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EffectstreamL2ContractModule", (m) => {
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("MyEffectstreamL2Contract", [owner, fee]);
  return { contract };
});
