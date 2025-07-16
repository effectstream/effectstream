import type { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  networks: {
    evmMain: {
      type: "edr",
      chainType: "l1",
      chainId: 31337,
      mining: {
        auto: true,
        interval: 250,
      },
      allowBlocksWithSameTimestamp: true,
    },
  },
  paths: {
    sources: [`./src/contracts`],
  },
  tasks: [],
  plugins: [],

  solidity: {
    profiles: {
      /*
       * The default profile is used when no profile is defined or specified
       * in the CLI or by the tasks you are running.
       */
      default: {
        version: "0.8.28",
      },
    },
  },
};

export default config;
