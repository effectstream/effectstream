import { GeneratedFile } from './generated-file.ts';

export class RootPackageJsonFile extends GeneratedFile {
    constructor(filePath: string) {
        super(filePath);
    }

    getContent(): string {
        const content = {
            dependencies: {
                "@electric-sql/pglite": "^0.3.14"
            }
        };
        return JSON.stringify(content, null, 4);
    }
}
