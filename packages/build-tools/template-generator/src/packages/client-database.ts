import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { DenoJsonFile, SqlFile } from '../file-types/index.ts';

export class ClientDatabasePackage extends Package {
    public async generate(): Promise<PackageInfo> {
        const dbPath = path.join(this.projectPath, 'packages', 'client', 'database');
        const packageName = `@${this.options.projectName}/client-database`;

        await new DenoJsonFile(
            path.join(dbPath, 'deno.json'),
            { name: packageName }
        ).write();

        const sqlPath = path.join(dbPath, 'src', 'sql');
        await new SqlFile(path.join(sqlPath, 'sm_example.sql'), '-- SQL queries for state machine\n').write();

        return { name: packageName, path: dbPath };
    }
}
