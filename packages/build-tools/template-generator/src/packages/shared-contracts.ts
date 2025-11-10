import path from 'node:path';
import { Package } from './abstract-package.ts';
import { DenoJsonFile, SolidityFile } from '../file-types/index.ts';

export class SharedContractsPackage extends Package {
    public async generate(): Promise<void> {
        const contractsPath = path.join(this.projectPath, 'packages', 'shared', 'contracts');

        for (const chain of this.options.chains) {
            const chainPath = path.join(contractsPath, chain);

            await new DenoJsonFile(
                path.join(chainPath, 'deno.json'),
                { name: `@${this.options.projectName}/shared-contracts-${chain}` }
            ).write();

            for (const contract of this.options.contracts[chain] || []) {
                await new SolidityFile(path.join(chainPath, `${contract}.sol`), contract).write();
            }

            if (chain === 'midnight') {
                for (const contract of this.options.contracts.midnight || []) {
                    await new DenoJsonFile(
                        path.join(chainPath, contract, 'deno.json'),
                        { name: `@${this.options.projectName}/shared-contracts-midnight-${contract}` }
                    ).write();
                }
            }
        }
    }
}
