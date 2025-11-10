import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, TypescriptFile } from '../file-types/index.ts';

export class ClientNodePackage extends Package {
    public async generate(): Promise<PackageInfo> {
        const nodePath = path.join(this.projectPath, 'packages', 'client', 'node');
        const packageName = `@${this.options.projectName}/client-node`;

        await new DenoJsonFile(
            path.join(nodePath, 'deno.json'),
            { name: packageName }
        ).write();

        const srcPath = path.join(nodePath, 'src');
        await new TypescriptFile(path.join(srcPath, 'main.ts'), '// Client main entry point\n').write();
        await new TypescriptFile(path.join(srcPath, 'api.ts'), '// Client API\n').write();
        await new TypescriptFile(path.join(srcPath, 'state-machine.ts'), '// State machine logic\n').write();
        
        return { name: packageName, path: nodePath };
    }
}
