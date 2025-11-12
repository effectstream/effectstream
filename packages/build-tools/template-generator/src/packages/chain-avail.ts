import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { Chain, PAIMA_VERSION } from '../options.ts';
import { scaffoldAvailProject } from '@effectstream/avail-contracts/scaffold';

export class ChainAvailPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const chainPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain + '-contracts');
        return await scaffoldAvailProject(chainPath, this.options.projectName, PAIMA_VERSION);
    }
}
