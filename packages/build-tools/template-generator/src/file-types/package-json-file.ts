import { GeneratedFile } from './generated-file.ts';

export class PackageJsonFile extends GeneratedFile {
    constructor(filePath: string, private content: object) {
        super(filePath);
    }

    getContent(): string {
        return JSON.stringify(this.content, null, 2);
    }
}


