import { TemplateOptions } from '../options.ts';

export interface PackageInfo {
    name: string;
    path: string;
}

export abstract class Package {
    constructor(protected projectPath: string, protected options: TemplateOptions) {}

    abstract generate(): Promise<PackageInfo | null>;
}
