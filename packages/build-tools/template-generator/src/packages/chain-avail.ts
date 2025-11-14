import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { Chain, EFFECTSTREAM_VERSION } from '../options.ts';
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
        // const contracts = this.options.contracts.evm?.map(contract => ({
        //     safeCodeName: ChainEVMPackage.safeCodeContractName(contract),
        //     safePackageName: ChainEVMPackage.safePackageName(contract),
        // })) || [];

        return await scaffoldAvailProject(
            chainPath, 
            this.options.projectName, 
            EFFECTSTREAM_VERSION
        );
    }

    public static availPrimitiveBlock(contract: string): string {
        return `
        .addPrimitive(
            (syncProtocols) => (syncProtocols as any).parallelAvail,
            (network, deployments, syncProtocol) => ({
                name: "AvailContractState",
                type: PrimitiveTypeAvailGeneric,
                startBlockHeight: 1,
                appId: readAvailApplication().appId,
                applicationKey: readAvailApplication().ApplicationKey,
                genesisHash: readAvailApplication().genesisHash,
                stateMachinePrefix: "avail-app-state",
            })
        )
        `;
    }
}
