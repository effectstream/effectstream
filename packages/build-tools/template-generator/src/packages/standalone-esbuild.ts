import * as path from "jsr:@std/path";
import { Package, PackageInfo } from './abstract-package.ts';
import { GeneratedFile } from '../file-types/generated-file.ts';
import { copyFiles } from "../file-operations.ts";

class StandaloneNpmrcFile extends GeneratedFile {
    constructor(filePath: string) {
        super(filePath);
    }

    getContent(): string {
        return '@jsr:registry=https://npm.jsr.io';
    }
}

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
            }
        );

        await new StandaloneNpmrcFile(path.join(frontendPath, '.npmrc')).write();

        return { name: packageName, path: frontendPath };
    }
}
