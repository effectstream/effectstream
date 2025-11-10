import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/index.ts';
import { Chain, PAIMA_VERSION } from '../options.ts';
import { scaffoldEVMProject } from '@effectstream/evm-hardhat/scaffold';

export class ChainEVMPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const chainPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain + '-contracts');
        return await scaffoldEVMProject(chainPath, this.options.projectName, PAIMA_VERSION);
    }
}
