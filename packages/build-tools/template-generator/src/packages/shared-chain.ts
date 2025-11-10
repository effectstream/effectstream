import path from 'node:path';
import { Package } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/index.ts';

export class SharedChainPackage extends Package {
    public async generate(): Promise<void> {
        const sharedPath = path.join(this.projectPath, 'packages', 'shared');

        for (const chain of this.options.chains) {
            await new DenoJsonFile(
                path.join(sharedPath, chain, 'deno.json'),
                { name: `@${this.options.projectName}/shared-${chain}` }
            ).write();
        }
    }
}
