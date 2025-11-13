import * as path from "jsr:@std/path";
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, TypescriptFile } from '../file-types/index.ts';
import { copyFiles } from '../file-operations.ts';
import { PAIMA_VERSION } from '../options.ts';

export class ClientNodePackage extends Package {
    public async generate(): Promise<PackageInfo> {
        const nodePath = path.join(this.projectPath, 'packages', 'client', 'node');
        const packageName = `@${this.options.projectName}/node`;

        const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
        const folders = [[], ["src"], ["scripts"]];
        for (const folder of folders) {
            await copyFiles(
                path.join(currentDir, "templates", "node", ...folder),
                path.join(nodePath, ...folder),
                {"scope": this.options.projectName} // replacements
              );
        }

        const deno = {
            "name": packageName,
            "version": "0.3.0",
            "license": "MIT",
            "exports": {
              ".": "./src/main.ts"
            },
            "tasks": {
              "check": "deno check --unstable-raw-imports src/main.ts",
              // Open chrome://inspect to see the inspector
              "node:start": "deno run -A --inspect --unstable-raw-imports src/main.ts",
              "dev": "deno task -f @paimaexample/tui clean && NODE_ENV=development deno run -A --check --unstable-raw-imports scripts/start.ts",
              "test": "deno run -A --unstable-raw-imports --check scripts/e2e.test.ts"
            },
            "imports": {
              "@paimaexample/concise": "jsr:@paimaexample/concise@" + PAIMA_VERSION,
              "@paimaexample/config": "jsr:@paimaexample/config@" + PAIMA_VERSION,
              "@paimaexample/log": "jsr:@paimaexample/log@" + PAIMA_VERSION,
              "@paimaexample/orchestrator": "jsr:@paimaexample/orchestrator@" + PAIMA_VERSION,
              "@paimaexample/runtime": "jsr:@paimaexample/runtime@" + PAIMA_VERSION,
              "@paimaexample/tui": "jsr:@paimaexample/tui@" + PAIMA_VERSION,
              "@paimaexample/utils": "jsr:@paimaexample/utils@" + PAIMA_VERSION,
              "@paimaexample/sm": "jsr:@paimaexample/sm@" + PAIMA_VERSION,
              "@paimaexample/coroutine": "jsr:@paimaexample/coroutine@" + PAIMA_VERSION,
              "@paimaexample/db": "jsr:@paimaexample/db@" + PAIMA_VERSION,
              "fastify": "npm:fastify@^5.4.0",
              "pg": "npm:pg@^8.14.0",
              "@sinclair/typebox": "npm:@sinclair/typebox@^0.34.30",
              "effection": "npm:effection@^3.5.0",
              "@paimaexample/explorer": "npm:@paimaexample/explorer@" + PAIMA_VERSION,
              "@midnight-ntwrk/onchain-runtime": "npm:@midnight-ntwrk/onchain-runtime@^0.3.0"
            }
          };
        
        await new DenoJsonFile(
            path.join(nodePath, 'deno.json'),
            deno
        ).write();
        
        return { name: packageName, path: nodePath };
    }
}
