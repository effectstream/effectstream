import path from 'node:path';
import { MainReadmeFile } from './file-types/readme-file.ts';
import { RootDenoJsonFile } from './file-types/deno-json-root-file.ts';
import { GitignoreFile } from './file-types/gitignore-file.ts';
import { RootPackageJsonFile } from './file-types/package-json-root-file.ts';
import { PatchFile } from './file-types/patch-file.ts';
import { TemplateOptions } from './options.ts';
import { PackageManager } from './package-manager.ts';
import { PackageInfo } from './packages/abstract-package.ts';

export class ProjectGenerator {
    constructor(private options: TemplateOptions) {}

    public async generate(): Promise<PackageInfo[]> {
        console.log("Generating project with options:", this.options);
        const projectPath = path.join(this.options.folderPath, this.options.projectName);

        // We don't really have a "root" package, so we'll just generate the files
        // and let the package manager handle the real packages.
        await this.createRootFiles(projectPath);
        
        return await this.createPackages(projectPath);
    }

    private async createRootFiles(projectPath: string): Promise<void> {
        await new RootDenoJsonFile(path.join(projectPath, 'deno.json'), this.options.projectName, this.options.chains, this.options.frontends[0]).write();
        await new MainReadmeFile(path.join(projectPath, 'README.md'), this.options.projectName, this.options.chains).write();
        await new GitignoreFile(path.join(projectPath, '.gitignore')).write();
        await new RootPackageJsonFile(path.join(projectPath, 'package.json')).write();
        await new PatchFile(path.join(projectPath, 'patch.sh')).write();
    }

    private async createPackages(projectPath: string): Promise<PackageInfo[]> {
        const packageManager = new PackageManager(projectPath, this.options);
        return await packageManager.generate();
    }
}
