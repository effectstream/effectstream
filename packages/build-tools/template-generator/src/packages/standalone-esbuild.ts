import * as path from "@std/path";
import { Package, PackageInfo } from './abstract-package.ts';
import { copyFiles } from "../file-operations.ts";
import { EFFECTSTREAM_VERSION } from "../options.ts";


export class StandaloneEsbuildPackage extends Package {
    public async generate(): Promise<PackageInfo | null> {
        if (!this.options.frontends.includes('standalone-esbuild')) {
            return null;
        }

        const frontendPath = path.join(this.projectPath, 'frontend', 'standalone');
        const packageName = `${this.options.projectName}-frontend-esbuild`;

        const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
        const templateDir = path.join(currentDir, 'templates', 'frontend-min');

        await copyFiles(
            templateDir,
            frontendPath,
            {
                "projectName": this.options.projectName,
                "EFFECTSTREAM-VERSION": EFFECTSTREAM_VERSION,
            }
        );

        return { name: packageName, path: frontendPath };
    }
}
