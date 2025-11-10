import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, TypescriptFile } from '../file-types/index.ts';

export class ClientBatcherPackage extends Package {
    public async generate(): Promise<PackageInfo | null> {
        if (!this.options.devOptions.useBatcher) {
            return null;
        }

        const batcherPath = path.join(this.projectPath, 'packages', 'client', 'batcher');
        const packageName = `@${this.options.projectName}/client-batcher`;

        await new DenoJsonFile(
            path.join(batcherPath, 'deno.json'),
            { name: packageName }
        ).write();

        await new TypescriptFile(path.join(batcherPath, 'main.ts'), '// Batcher main entry point\n').write();
        await new TypescriptFile(path.join(batcherPath, 'config.ts'), '// Batcher config\n').write();

        return { name: packageName, path: batcherPath };
    }
}
