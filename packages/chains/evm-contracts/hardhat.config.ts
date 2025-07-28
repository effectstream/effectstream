import type { HardhatUserConfig } from "hardhat/config";

import { defaultHardhatConfig } from "./src/recommendedHardhat.ts";

const config: HardhatUserConfig = {
  ...defaultHardhatConfig({
    outDir: "./build",
  }),
};

export default config;
