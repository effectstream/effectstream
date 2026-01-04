import { TemplateOptions } from './options.ts';
import { ClientNodePackage } from './packages/client-node.ts';
import { ClientDatabasePackage } from './packages/client-database.ts';
import { ClientBatcherPackage } from './packages/client-batcher.ts';
import { ChainCardanoPackage } from './packages/chain-cardano.ts';
import { ChainBitcoinPackage } from './packages/chain-bitcoin.ts';
import { ChainAvailPackage } from './packages/chain-avail.ts';
import { ChainEVMPackage } from './packages/chain-evm.ts';
import { ChainMidnightPackage } from './packages/chain-midnight.ts';
import { SharedDataTypesPackage } from './packages/shared-data-types.ts';
import { StandaloneEsbuildPackage } from './packages/standalone-esbuild.ts';
import { PackageInfo } from './packages/abstract-package.ts';

export class PackageManager {
    constructor(private projectPath: string, private options: TemplateOptions) {}

    public async generate(): Promise<PackageInfo[]> {
        const createdPackages: (PackageInfo | null)[] = [];

        createdPackages.push(await new ClientNodePackage(this.projectPath, this.options).generate());
        createdPackages.push(await new ClientDatabasePackage(this.projectPath, this.options).generate());
        createdPackages.push(await new ClientBatcherPackage(this.projectPath, this.options).generate());
        createdPackages.push(await new SharedDataTypesPackage(this.projectPath, this.options).generate());

        for (const chain of this.options.chains) {
            if (chain === 'evm') {
                createdPackages.push(await new ChainEVMPackage(this.projectPath, this.options, chain).generate());
            } else if (chain === 'midnight') {
                const chainPackage = await new ChainMidnightPackage(this.projectPath, this.options, chain).generate();
                createdPackages.push(chainPackage);
                if (chainPackage.subPackages) {
                    createdPackages.push(...chainPackage.subPackages);
                }
            } else if (chain === 'cardano') {
                createdPackages.push(await new ChainCardanoPackage(this.projectPath, this.options, chain).generate());
            } else if (chain === 'bitcoin') {
                createdPackages.push(await new ChainBitcoinPackage(this.projectPath, this.options, chain).generate());
            } else if (chain === 'avail') {
                createdPackages.push(await new ChainAvailPackage(this.projectPath, this.options, chain).generate());
            } else {    
                throw new Error(`Chain ${chain} not supported`);
            }
        }
        if (this.options.frontends.includes('standalone-esbuild')) {
            createdPackages.push(await new StandaloneEsbuildPackage(this.projectPath, this.options).generate());
        }

        return createdPackages.filter((p): p is PackageInfo => p != null);
    }
}
