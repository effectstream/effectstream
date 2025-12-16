import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox-viem';
import '@nomicfoundation/hardhat-ignition-viem';
import 'hardhat-dependency-compiler';
import 'hardhat-interact';
import 'hardhat-abi-exporter';

import * as dotenv from 'dotenv';

const testnet: Record<string, string> = {};
const mainnet: Record<string, string> = {};
dotenv.config({ path: './../.env.testnet', processEnv: testnet });
dotenv.config({ path: './../.env.mainnet', processEnv: mainnet });

const config: HardhatUserConfig = {
  solidity: '0.8.20',
  paths: {
    sources: './contracts/evm/solidity',
    tests: './contracts/evm/test',
    cache: './contracts/evm/cache',
    artifacts: './contracts/evm/artifacts',
    ignition: './contracts/evm/ignition',
  },
  networks: {
    // note: localhost / hardhat networks exist implicitly
    // hardhat is in-process (temporal) created for single commands. localhost is persisted by `npx hardhat node`
    hardhat: {
      mining: {
        auto: true,
        interval: 2000,
      },
    },
    testnet: {
      url: testnet.CHAIN_URI ?? '',
      accounts: testnet.DEPLOYER_PRIVATE_KEY == null ? [] : [testnet.DEPLOYER_PRIVATE_KEY],
    },
    production: {
      url: mainnet.CHAIN_URI ?? '',
      accounts: mainnet.DEPLOYER_PRIVATE_KEY == null ? [] : [mainnet.DEPLOYER_PRIVATE_KEY],
    },
  },
  dependencyCompiler: {
    paths: ['@paima/evm-contracts/contracts/PaimaL2Contract.sol'],
  },
  abiExporter: {
    path: './contracts/evm/abi',
    runOnCompile: true,
    tsWrapper: true,
    clear: true,
    flat: false,
  },
};

export default config;
