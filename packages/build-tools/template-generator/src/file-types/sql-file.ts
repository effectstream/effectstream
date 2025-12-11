import { GeneratedFile } from './generated-file.ts';

export class SqlFile extends GeneratedFile {
    constructor(filePath: string, private content: string) {
        super(filePath);
    }

    getContent(): string {
        return this.content;
    }
}


