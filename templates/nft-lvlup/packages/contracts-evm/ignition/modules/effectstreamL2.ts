import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("EffectstreamL2Module", (m) => {
  const owner = m.getParameter("owner");
  const fee = m.getParameter("fee");
  const contract = m.contract("MyEffectstreamL2", [owner, fee]);
  return { contract };
});
