import { defineConfig } from "@wagmi/cli";
import { hardhat } from "@wagmi/cli/plugins";
// TODO This didn't work with deno package manager.
export default defineConfig({
  // using abi instead of generated to avoid being ignored by git
  out: `./build/generated/abis.ts`,
  plugins: [
    hardhat({
      artifacts: `./build/artifacts/hardhat/src/contracts`,
      exclude: ["**/test"],
      project: "./",
    }),
  ],
});
