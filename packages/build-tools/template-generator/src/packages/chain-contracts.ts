import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, SolidityFile } from '../file-types/index.ts';
import { Chain } from '../options.ts';

export class ChainContractsPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const contractsPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain);
        const packageName = `@${this.options.projectName}/shared-contracts-${this.chain}`;

        await new DenoJsonFile(
            path.join(contractsPath, 'deno.json'),
            { name: packageName }
        ).write();

        for (const contract of this.options.contracts[this.chain] || []) {
            await new SolidityFile(path.join(contractsPath, `${contract}.sol`), contract).write();
        }

        return { name: packageName, path: contractsPath };
    }
}
