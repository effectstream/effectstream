import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("ExampleContractModule", (m) => {
  const contract = m.contract("ExampleContract");
  return { contract };
});
