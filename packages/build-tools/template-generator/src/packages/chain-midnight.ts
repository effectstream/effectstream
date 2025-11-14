import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { Chain, EFFECTSTREAM_VERSION } from '../options.ts';
import { scaffoldMidnightProject, scaffoldMidnightContract } from '@effectstream/midnight-contracts/scaffold';

export class ChainMidnightPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    static midnightImportBlock = (projectName: string, contractName: string) => {
        const safeCodeContractName = ChainMidnightPackage.safeCodeContractName(contractName);
        const safePackageName = ChainMidnightPackage.safePackageName(contractName);
        return `
          import * as ${safeCodeContractName}Contract from "@${projectName}/midnight-contract-${safePackageName}/contract";
        `;
      }
  
      static midnightPrimitiveBlock = (contractName: string) => {
        const safeCodeContractName = ChainMidnightPackage.safeCodeContractName(contractName);
        const safePackageName = ChainMidnightPackage.safePackageName(contractName);
        return `
        .addPrimitive(
          (syncProtocols) => syncProtocols.parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "MidnightContractState",
            type: PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContract("${safePackageName}", "contract-${safePackageName}.json").contractAddress,
            stateMachinePrefix: "midnightContractState",
            contract: { ledger: ${safeCodeContractName}Contract.ledger },
            networkId: 0,
          })
        )
      `;
      }

    static safeCodeContractName(contractName: string): string {
        return contractName.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    static safePackageName(contractName: string): string {
        return contractName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    }

    public async generate(): Promise<PackageInfo> {
        const chainPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain + '-contracts');

        const packageInfo = await scaffoldMidnightProject(
            chainPath, 
            this.options.projectName, 
            EFFECTSTREAM_VERSION,
            this.options.contracts.midnight?.map(contract => ({
                safeCodeName: ChainMidnightPackage.safeCodeContractName(contract),
                safePackageName: ChainMidnightPackage.safePackageName(contract),
            })) || []
        );

        const subPackages: PackageInfo[] = [];
        for (const contract of this.options.contracts.midnight || []) {
            const safeCodeContractName = ChainMidnightPackage.safeCodeContractName(contract);
            const safePackageName = ChainMidnightPackage.safePackageName(contract);
            const contractPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', 'midnight-contracts', safePackageName);


            const contractInfo = await scaffoldMidnightContract(
                contractPath, 
                this.options.projectName, 
                safeCodeContractName,
                safePackageName,
                EFFECTSTREAM_VERSION
            );
            subPackages.push(contractInfo);
        }

        return { name: packageInfo.name, path: packageInfo.path, subPackages };
    }
}
