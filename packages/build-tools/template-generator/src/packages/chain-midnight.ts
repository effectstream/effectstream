import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/index.ts';
import { Chain, PAIMA_VERSION } from '../options.ts';
import { MidnightContractPackage } from './midnight-contract.ts';

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
        const packageName = `@${this.options.projectName}/contracts-${this.chain}`;

        await new DenoJsonFile(
            path.join(chainPath, 'deno.json'),
            { name: packageName }
        ).write();

        const subPackages: PackageInfo[] = [];
        for (const contract of this.options.contracts.midnight || []) {
            subPackages.push(await new MidnightContractPackage(this.projectPath, this.options, contract).generate());
        }

        return { name: packageName, path: chainPath, subPackages };
    }
}
