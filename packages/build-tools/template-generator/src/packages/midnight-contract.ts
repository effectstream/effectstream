import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/index.ts';
import { Contract } from '../options.ts';

export class MidnightContractPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private contract: Contract,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const contractPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', 'midnight', this.contract);
        const packageName = `@${this.options.projectName}/shared-contracts-midnight-${this.contract}`;

        await new DenoJsonFile(
            path.join(contractPath, 'deno.json'),
            { name: packageName }
        ).write();

        return { name: packageName, path: contractPath };
    }
}
