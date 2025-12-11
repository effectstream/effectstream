import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/deno-json-file.ts';
import { Chain, EFFECTSTREAM_VERSION } from '../options.ts';
import { scaffoldCardanoProject } from '@effectstream/cardano-contracts/scaffold';

export class ChainCardanoPackage extends Package {
    constructor(
        projectPath: string,
        options: Package['options'],
        private chain: Chain,
    ) {
        super(projectPath, options);
    }

    public async generate(): Promise<PackageInfo> {
        const chainPath = path.join(this.projectPath, 'packages', 'shared', 'contracts', this.chain + '-contracts');
        
        return await scaffoldCardanoProject(
            chainPath, 
            this.options.projectName, 
            EFFECTSTREAM_VERSION
        );
    }

    public static cardanoPrimitiveBlock(contract: string): string {
        return ``
    }
}
