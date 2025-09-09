import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("CounterModule", (m) => {
  const contract = m.contract("Counter");
  return { contract };
});
