import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { Chain, PAIMA_VERSION } from '../options.ts';
import { scaffoldMidnightProject } from '@effectstream/midnight-contracts/scaffold';
import { scaffoldMidnightContract } from '@effectstream/midnight-contracts/scaffold-contract';

export class ChainMidnightPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const chainPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain + '-contracts');

        const packageInfo = await scaffoldMidnightProject(chainPath, this.options.projectName, PAIMA_VERSION);

        const subPackages: PackageInfo[] = [];
        for (const contract of this.options.contracts.midnight || []) {
            const contractPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', 'midnight-contracts', contract);

            const contractInfo = await scaffoldMidnightContract(contractPath, this.options.projectName, contract, PAIMA_VERSION);
            subPackages.push(contractInfo);
        }

        return { name: packageInfo.name, path: packageInfo.path, subPackages };
    }
}
