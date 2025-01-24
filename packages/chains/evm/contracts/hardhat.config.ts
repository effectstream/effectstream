import type { HardhatUserConfig } from "@ignored/hardhat-vnext/config";

import { defaultHardhatConfig } from "./src/recommendedHardhat.ts";

const config: HardhatUserConfig = {
  ...defaultHardhatConfig({
    outDir: "./build",
  }),
};

export default config;
