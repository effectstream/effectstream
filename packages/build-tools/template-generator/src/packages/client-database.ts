import * as path from "jsr:@std/path";
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, SqlFile } from '../file-types/index.ts';
import { copyFiles } from '../file-operations.ts';
import { EFFECTSTREAM_VERSION } from '../options.ts';

export class ClientDatabasePackage extends Package {
    public async generate(): Promise<PackageInfo> {
        const dbPath = path.join(this.projectPath, 'packages', 'client', 'database');
        const packageName = `@${this.options.projectName}/database`;

        const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
        const folders = [[], ["src"], ["src", "migrations"], ["src", "sql"]];

        for (const folder of folders) {
            await copyFiles(
                path.join(currentDir, "templates", "database", ...folder),
                path.join(dbPath, ...folder),
                {"scope": this.options.projectName} // replacements
            );
        }

        const deno = {
            "name": packageName,
            "version": "0.3.0",
            "license": "MIT",
            "exports": "./src/mod.ts",
            "imports": {
                "@paimaexample/config": "jsr:@paimaexample/config@" + EFFECTSTREAM_VERSION,
                "@paimaexample/runtime": "jsr:@paimaexample/runtime@" + EFFECTSTREAM_VERSION,
                "@paimaexample/sm": "jsr:@paimaexample/sm@" + EFFECTSTREAM_VERSION,
                "@pgtyped/runtime": "npm:@pgtyped/runtime@2.4.2",
                "@paimaexample/db": "jsr:@paimaexample/db@" + EFFECTSTREAM_VERSION,
                "pg": "npm:pg@^8.14.0",
                "effection": "npm:effection@3.5.0"
            },
            "tasks": {
                "_pgtyped:my-sql": "deno run -A @paimaexample/db/db-wait && deno run -A @paimaexample/db/apply-migrations && deno run -A --unstable-raw-imports sql-to-ts.ts && pgtyped -c ./pgtypedconfig.json",
                "pgtyped:update": "concurrently --raw --kill-others \"deno run -A @paimaexample/db/db-up\" \"deno task _pgtyped:my-sql\""
            }
        };

        await new DenoJsonFile(
            path.join(dbPath, 'deno.json'),
            deno
        ).write();

        return { name: packageName, path: dbPath };
    }
}
