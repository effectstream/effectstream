import React, { useState, useEffect, useMemo } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { ProjectGenerator } from './project-generator.ts';
import { type TemplateOptions, ALL_CHAINS, CONTRACTS_BY_CHAIN, ALL_FRONTENDS, type Chain, type Contract, type Frontend, DEFAULT_DEV_OPTIONS } from './options.ts';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';


const sanitizeProjectName = (name: string) => {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const Banner = () => (
    <Box flexDirection="column" marginBottom={1}>
        <Text>=========================================</Text>
        <Text>     Effectstream Template Generator     </Text>
        <Text>=========================================</Text>
    </Box>
);


type Step =
  | 'projectName'
  | 'confirmProjectName'
  | 'selectFolder'
  | 'selectChains'
  | 'selectContracts'
  | 'selectFrontend'
  | 'selectDevOptions'
  | 'summary';


const CustomMultiSelect = ({ items, selected, onToggle }: { items: {label: string, value: string}[], selected: Set<string>, onToggle: (value: string) => void }) => {
    const [focusIndex, setFocusIndex] = useState(0);

    useInput((input, key) => {
        if (key.upArrow) {
            setFocusIndex(Math.max(0, focusIndex - 1));
        } else if (key.downArrow) {
            setFocusIndex(Math.min(items.length - 1, focusIndex + 1));
        } else if (input === ' ') {
            const item = items[focusIndex];
            if (!item) return;
            onToggle(item.value);
        }
    });

    return (
        <Box flexDirection="column">
            {items.map((item, index) => (
                <Text key={item.value}>
                    {focusIndex === index ? '> ' : '  '}
                    [{selected.has(item.value) ? 'x' : ' '}] {item.label}
                </Text>
            ))}
        </Box>
    );
};


class OptionsSelector {
    private options: TemplateOptions | undefined;

    private SelectionComponent = ({ onComplete }: { onComplete: (options: TemplateOptions) => void }) => {
        const [step, setStep] = useState<Step>('projectName');
        const [options, setOptions] = useState<Partial<TemplateOptions>>({
            projectName: '',
            folderPath: process.env.TEMPLATE_PATH || '.',
            chains: [],
            contracts: {},
            frontends: [],
            devOptions: DEFAULT_DEV_OPTIONS,
        });
        const [contractSelectionChainIndex, setContractSelectionChainIndex] = useState(0);
        const { exit } = useApp();

        const handleProjectNameSubmit = (projectName: string) => {
            const nameToConfirm = projectName.trim() === '' ? "My Project" : projectName;
            setOptions(prev => ({ ...prev, projectName: nameToConfirm }));
            setStep('confirmProjectName');
        };

        const handleProjectNameConfirm = (item: { value: 'yes' | 'no' }) => {
            if (item.value === 'yes') {
                setOptions(prev => ({ ...prev, projectName: sanitizeProjectName(prev.projectName!) }));
                setStep('selectFolder');
            } else {
                setOptions(prev => ({ ...prev, projectName: '' }));
                setStep('projectName');
            }
        };

        const handleFolderPathSubmit = (folderPath: string) => {
            setOptions(prev => ({ ...prev, folderPath }));
            setStep('selectChains');
        };

        const handleChainsSubmit = () => {
            if (options.chains && options.chains.length > 0) {
                setStep('selectContracts');
            } else {
                setStep('selectFrontend');
            }
        };

        const handleContractsSubmit = () => {
             if (contractSelectionChainIndex + 1 < options.chains!.length) {
                setContractSelectionChainIndex(i => i + 1);
            } else {
                setStep('selectFrontend');
            }
        };

        const handleFrontendsSubmit = () => {
            setStep('selectDevOptions');
        };

        const handleDevOptionsSubmit = () => {
            setStep('summary');
        };

        const handleConfirm = (item: { value: 'yes' | 'no' }) => {
            if (item.value === 'yes') {
                onComplete(options as TemplateOptions);
                exit();
            } else {
                setStep('projectName');
                setOptions({
                    projectName: '',
                    folderPath: process.env.TEMPLATE_PATH || '.',
                    chains: [],
                    contracts: {},
                    frontends: [],
                    devOptions: DEFAULT_DEV_OPTIONS,
                });
                setContractSelectionChainIndex(0);
            }
        };

        let currentStepComponent;
        switch (step) {
            case 'projectName':
                currentStepComponent = (
                    <Box>
                        <Text>Enter project name: </Text>
                        <TextInput
                            placeholder="My Project"
                            value={options.projectName!}
                            onChange={(value: string) => setOptions(prev => ({...prev, projectName: value}))}
                            onSubmit={handleProjectNameSubmit}
                        />
                    </Box>
                );
                break;
            case 'confirmProjectName': {
                const sanitizedName = sanitizeProjectName(options.projectName!);
                currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>The package-friendly name will be: "{sanitizedName}". Is this ok?</Text>
                        <SelectInput items={[{label: 'Yes', value: 'yes'}, {label: 'No', value: 'no'}]} onSelect={handleProjectNameConfirm} />
                    </Box>
                );
                break;
            }
            case 'selectFolder':
                currentStepComponent = (
                    <Box>
                        <Text>Enter destination folder (default: current directory): </Text>
                        <TextInput
                            value={options.folderPath!}
                            onChange={(value: string) => setOptions(prev => ({...prev, folderPath: value}))}
                            onSubmit={handleFolderPathSubmit}
                        />
                    </Box>
                );
                break;
            case 'selectChains':
                currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>Select chains (press space to select, enter to submit):</Text>
                        <CustomMultiSelect
                            items={ALL_CHAINS}
                            selected={new Set(options.chains)}
                            onToggle={(chain) => {
                                const newChains = new Set(options.chains);
                                if (newChains.has(chain as Chain)) {
                                    newChains.delete(chain as Chain);
                                } else {
                                    newChains.add(chain as Chain);
                                }
                                setOptions(prev => ({ ...prev, chains: Array.from(newChains) }));
                            }}
                        />
                         <SelectInput items={[{label: 'Continue', value: 'continue'}]} onSelect={handleChainsSubmit} />
                    </Box>
                );
                break;
            case 'selectContracts': {
                const currentChain = options.chains![contractSelectionChainIndex];
                 currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>Select contracts for {currentChain} (press space to select, enter to submit):</Text>
                        <CustomMultiSelect
                            key={currentChain}
                            items={CONTRACTS_BY_CHAIN[currentChain]}
                            selected={new Set(options.contracts![currentChain])}
                            onToggle={(contract) => {
                                const newContracts = new Set(options.contracts![currentChain]);
                                if (newContracts.has(contract as Contract)) {
                                    newContracts.delete(contract as Contract);
                                } else {
                                    newContracts.add(contract as Contract);
                                }
                                setOptions(prev => ({
                                    ...prev,
                                    contracts: {
                                        ...prev.contracts,
                                        [currentChain]: Array.from(newContracts),
                                    },
                                }));
                            }}
                        />
                        <SelectInput items={[{label: 'Continue', value: 'continue'}]} onSelect={handleContractsSubmit} />
                    </Box>
                );
                break;
            }
            case 'selectFrontend':
                currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>Select frontend frameworks (optional):</Text>
                        <CustomMultiSelect
                            items={ALL_FRONTENDS}
                            selected={new Set(options.frontends)}
                            onToggle={(frontend) => {
                                const newFrontends = new Set(options.frontends);
                                if (newFrontends.has(frontend as Frontend)) {
                                    newFrontends.delete(frontend as Frontend);
                                } else {
                                    newFrontends.add(frontend as Frontend);
                                }
                                setOptions(prev => ({ ...prev, frontends: Array.from(newFrontends) }));
                            }}
                        />
                        <SelectInput items={[{label: 'Continue', value: 'continue'}]} onSelect={handleFrontendsSubmit} />
                    </Box>
                );
                break;
            case 'selectDevOptions': {
                currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>Select dev options:</Text>
                        <CustomMultiSelect
                            items={[
                                { label: 'In-memory DB for development', value: 'in-memory-db' },
                                { label: 'Use Batcher', value: 'use-batcher' }
                            ]}
                            selected={new Set(
                                Object.entries(options.devOptions!)
                                    .filter(([, value]) => value)
                                    .map(([key]) => key === 'inMemoryDb' ? 'in-memory-db' : 'use-batcher')
                            )}
                            onToggle={(option) => {
                                setOptions(prev => ({
                                    ...prev,
                                    devOptions: {
                                        ...prev.devOptions,
                                        inMemoryDb: option === 'in-memory-db' ? !prev.devOptions!.inMemoryDb : prev.devOptions!.inMemoryDb,
                                        useBatcher: option === 'use-batcher' ? !prev.devOptions!.useBatcher : prev.devOptions!.useBatcher,
                                    },
                                }));
                            }}
                        />
                        <SelectInput items={[{label: 'Continue', value: 'continue'}]} onSelect={handleDevOptionsSubmit} />
                    </Box>
                );
                break;
            }
            case 'summary':
                currentStepComponent = (
                    <Box flexDirection="column">
                        <Text>Summary:</Text>
                        <Text>Project Name: {options.projectName!}</Text>
                        <Text>Destination: {path.resolve(process.cwd(), options.folderPath!, options.projectName!)}</Text>
                        <Text>Chains: {options.chains!.join(', ')}</Text>
                        {options.chains!.map(chain => (
                            <Text key={chain}>
                                  Contracts for {chain}: {options.contracts![chain]?.join(', ') || 'none'}
                            </Text>
                        ))}
                        <Text>Frontends: {options.frontends!.join(', ') || 'none'}</Text>
                        <Text>In-memory DB: {options.devOptions!.inMemoryDb ? 'Yes' : 'No'}</Text>
                        <Text>Use Batcher: {options.devOptions!.useBatcher ? 'Yes' : 'No'}</Text>
                        <Text>Generate project?</Text>
                        <SelectInput items={[{label: 'Yes', value: 'yes'}, {label: 'No', value: 'no'}]} onSelect={handleConfirm} />
                    </Box>
                );
                break;
            default:
                currentStepComponent = null;
        }

        return (
            <Box flexDirection="column">
                <Banner />
                {currentStepComponent}
            </Box>
        );
    }

    public getOptions(): Promise<TemplateOptions> {
        return new Promise((resolve) => {
            const onComplete = (options: TemplateOptions) => {
                this.options = options;
                resolve(options);
            };

            render(<this.SelectionComponent onComplete={onComplete} />);
        });
    }
}

async function main() {
    let options: TemplateOptions;
    const configFile = process.env.TEMPLATE_CONFIG_FILE;
    const allOptionsFile = process.env.TEMPLATE_CONFIG_FILE_ALL;

    if (allOptionsFile) {
        console.log(`Loading all options because TEMPLATE_CONFIG_FILE_ALL is set.`);
        
        const allChains = ALL_CHAINS.map(c => c.value as Chain);
        const allContracts: TemplateOptions['contracts'] = {};
        for (const chain of allChains) {
            if (CONTRACTS_BY_CHAIN[chain]) {
                allContracts[chain] = CONTRACTS_BY_CHAIN[chain].map(c => c.value as Contract);
            }
        }
        
        options = {
            projectName: 'my-project-all',
            folderPath: process.env.TEMPLATE_PATH || '.',
            chains: allChains,
            contracts: allContracts,
            frontends: ALL_FRONTENDS.map(f => f.value as Frontend),
            devOptions: {
                inMemoryDb: true,
                useBatcher: true,
            },
        };

        options.projectName = sanitizeProjectName(options.projectName);

    } else if (configFile) {
        console.log(`Loading configuration from: ${configFile}`);
        try {
            if (!fs.existsSync(configFile)) {
                console.error(`Configuration file not found: ${configFile}`);
                process.exit(1);
            }

            const configContent = fs.readFileSync(configFile, 'utf-8');
            const configFromFile = JSON.parse(configContent) as Partial<TemplateOptions>;

            const defaultOptions = {
                projectName: 'My Project',
                folderPath: process.env.TEMPLATE_PATH || '.',
                chains: [],
                contracts: {},
                frontends: [],
                devOptions: DEFAULT_DEV_OPTIONS,
            };

            options = {
                ...defaultOptions,
                ...configFromFile,
                devOptions: {
                    ...defaultOptions.devOptions,
                    ...(configFromFile.devOptions || {}),
                },
            };

            options.projectName = sanitizeProjectName(options.projectName);

        } catch (error) {
            console.error(`Error processing configuration file: ${configFile}`);
            console.error(error);
            process.exit(1);
        }
    } else {
        const selector = new OptionsSelector();
        options = await selector.getOptions();
    }

    const generator = new ProjectGenerator(options);
    const createdPackages = await generator.generate();

    console.log(`\nProject ${options.projectName} generated successfully!`);

    if (createdPackages && createdPackages.length > 0) {
        const longestName = Math.max(...createdPackages.map(p => p.name.length));
        const longestPath = Math.max(...createdPackages.map(p => p.path.length));
        
        const header = `| ${'Package'.padEnd(longestName)} | ${'Path'.padEnd(longestPath)} |`;
        const separator = `|-${'-'.repeat(longestName)}-|-${'-'.repeat(longestPath)}-|`;

        console.log('\nCreated packages:');
        console.log(header);
        console.log(separator);
        createdPackages.forEach(pkg => {
            console.log(`| ${pkg.name.padEnd(longestName)} | ${pkg.path.padEnd(longestPath)} |`);
        });
    }
}

main();
