import { TemplateOptions } from './options.ts';
import { ClientNodePackage } from './packages/client-node.ts';
import { ClientDatabasePackage } from './packages/client-database.ts';
import { ClientBatcherPackage } from './packages/client-batcher.ts';
import { ChainPackage } from './packages/chain.ts';
import { ChainContractsPackage } from './packages/chain-contracts.ts';
import { MidnightContractPackage } from './packages/midnight-contract.ts';
import { SharedDataTypesPackage } from './packages/shared-data-types.ts';
import { IntegratedViteDenoPackage } from './packages/integrated-vite-deno.ts';
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
            createdPackages.push(await new ChainPackage(this.projectPath, this.options, chain).generate());
            createdPackages.push(await new ChainContractsPackage(this.projectPath, this.options, chain).generate());

            if (chain === 'midnight') {
                for (const contract of this.options.contracts.midnight || []) {
                    createdPackages.push(await new MidnightContractPackage(this.projectPath, this.options, contract).generate());
                }
            }
        }

        createdPackages.push(await new IntegratedViteDenoPackage(this.projectPath, this.options).generate());
        createdPackages.push(await new StandaloneEsbuildPackage(this.projectPath, this.options).generate());

        return createdPackages.filter((p): p is PackageInfo => p != null);
    }
}
