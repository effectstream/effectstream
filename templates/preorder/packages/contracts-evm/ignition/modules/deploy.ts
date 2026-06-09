import { buildModule } from "@nomicfoundation/ignition-core";

export const MockERC20Module = buildModule("MockERC20Module", (m) => {
  const mockErc20 = m.contract("MockERC20", []);
  return { mockErc20 };
});

export const LaunchpadImplementationModule = buildModule("LaunchpadImplModule", (m) => {
  const impl = m.contract("PaimaLaunchpad", []);
  return { impl };
});

export const LaunchpadFactoryModule = buildModule("LaunchpadFactoryModule", (m) => {
  const { impl } = m.useModule(LaunchpadImplementationModule);
  const owner = m.getAccount(0);
  const factory = m.contract("PaimaLaunchpadFactory", [impl, owner, false]);
  return { factory };
});

// Deterministic admin/config inbox. Owner = account #0 (the deployer/admin); fee 0 in dev.
export const EffectstreamL2Module = buildModule("EffectstreamL2Module", (m) => {
  const owner = m.getAccount(0);
  const l2 = m.contract("EffectstreamL2Contract", [owner, 0n]);
  return { l2 };
});

export default LaunchpadFactoryModule;
