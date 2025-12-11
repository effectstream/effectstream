import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile } from '../file-types/deno-json-file.ts';
import { TypescriptFile } from '../file-types/typescript-file.ts';

export class IntegratedViteDenoPackage extends Package {
    public async generate(): Promise<PackageInfo | null> {
        if (!this.options.frontends.includes('intergrated-vite-deno')) {
            return null;
        }

        const frontendPath = path.join(this.projectPath, 'packages', 'frontend', 'intergrated-vite-deno');
        const packageName = `@${this.options.projectName}/frontend-vite`;

        await new DenoJsonFile(
            path.join(frontendPath, 'deno.json'),
            { name: packageName }
        ).write();

        const clientSrcPath = path.join(frontendPath, 'client', 'src');
        await new TypescriptFile(path.join(clientSrcPath, 'main.tsx'), '// Frontend entry point\n').write();
        await new TypescriptFile(path.join(frontendPath, 'vite.config.ts'), '// Vite config\n').write();

        return { name: packageName, path: frontendPath };
    }
}
