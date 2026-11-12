import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("CkbEventRelayModule", (m) => {
  const relayer = m.getParameter("relayer");
  const contract = m.contract("CkbEventRelay", [relayer]);
  return { contract };
});
