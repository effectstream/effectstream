import { GeneratedFile } from './generated-file.ts';

export class SolidityFile extends GeneratedFile {
    constructor(filePath: string, private contractName: string) {
        super(filePath);
    }

    getContent(): string {
        return `// SPDX-License-Identifier: UNLICENSED\npragma solidity ^0.8.20;\n\ncontract ${this.contractName} {}\n`;
    }
}


