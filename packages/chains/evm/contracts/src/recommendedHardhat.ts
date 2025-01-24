import type { HardhatUserConfig } from "@ignored/hardhat-vnext/config";
import HardhatViem from "@ignored/hardhat-vnext-viem";
// import "hardhat-interact";
import HardhatAbiExporter from "hardhat-abi-exporter";

export function defaultHardhatConfig(config: {
  outDir: string;
}): HardhatUserConfig {
  const defaultConfig: HardhatUserConfig = {
    paths: {
      sources: "./src/contracts",
      tests: "./test/src",
      cache: `${config.outDir}/cache/hardhat`,
      artifacts: `${config.outDir}/artifacts/hardhat`,
      // ignition: "./src/ignition",
    },
    tasks: [],
    plugins: [
      HardhatViem,
      HardhatAbiExporter,
    ],
    solidity: {
      version: "0.8.22",
      dependenciesToCompile: [],
      remappings: [
        "remapped/=npm/@openzeppelin/contracts@5.1.0/access/",
        // This is necessary because most people import forge-std/Test.sol, and not forge-std/src/Test.sol
        "forge-std/=npm/forge-std@local/src/",
      ],
    },
    abiExporter: {
      path: `${config.outDir}/abi`,
      runOnCompile: true,
      tsWrapper: true,
      clear: true,
      flat: false,
    },
  };

  return defaultConfig;
}

// /**
//  * This type comes from hardhat-ignition. It's unfortunately not exported
//  */
// type IgnitionDeployParameters = {
//   modulePath: string;
//   parameters?: string;
//   deploymentId: string | undefined;
//   defaultSender: string | undefined;
//   reset: boolean;
//   verify: boolean;
//   strategy: string;
//   writeLocalhostDeployment: boolean;
// };

// /**
//  * TODO: this may be replaced by a built-in feature in the future
//  * https://github.com/NomicFoundation/hardhat-ignition/issues/791
//  */
// export function defaultDeployment(
//   rootDir: string,
//   outDir: string,
//   config: IgnitionDeployParameters
// ): void {
//   subtask(TASK_NODE_SERVER_READY, async (_, hre, runSuper) => {
//     const result = await runSuper();

//     await hre.run(
//       {
//         scope: 'ignition',
//         task: 'deploy',
//       },
//       config
//     );
//     await hre.run(
//       {
//         scope: 'paima',
//         task: 'copy-ignition-deployment',
//       },
//       { rootDir, outDir }
//     );

//     return result;
//   });
// }
