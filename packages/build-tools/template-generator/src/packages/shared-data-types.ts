import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/index.ts';

export class SharedDataTypesPackage extends Package {
    public async generate(): Promise<PackageInfo> {
        const dataTypesPath = path.join(this.projectPath, 'packages', 'shared', 'data-types');
        const packageName = `@${this.options.projectName}/shared-data-types`;

        await new DenoJsonFile(
            path.join(dataTypesPath, 'deno.json'),
            { name: packageName }
        ).write();

        return { name: packageName, path: dataTypesPath };
    }
}
