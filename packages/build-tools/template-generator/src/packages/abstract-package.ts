import { TemplateOptions } from '../options.ts';

export interface PackageInfo {
    name: string;
    path: string;
    subPackages?: PackageInfo[];
}

export abstract class Package {
    constructor(protected projectPath: string, protected options: TemplateOptions) {}

    abstract generate(): Promise<PackageInfo | null>;
}
