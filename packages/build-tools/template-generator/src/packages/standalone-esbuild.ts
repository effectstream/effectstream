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
            },
            {
                "EVM-BLOCK": this.options.chains.includes("evm"),
                "MIDNIGHT-BLOCK": this.options.chains.includes("midnight"),
                "AVAIL-BLOCK": this.options.chains.includes("avail"),
                "CARDANO-BLOCK": this.options.chains.includes("cardano"),
                "BITCOIN-BLOCK": this.options.chains.includes("bitcoin"),
              },
        );

        return { name: packageName, path: frontendPath };
    }
}
