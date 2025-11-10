import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { ProjectGenerator, TemplateOptions, ALL_CHAINS, ALL_CONTRACTS, ALL_FRONTENDS, Chain, Contract, Frontend } from './project-generator.ts';


type Step =
  | 'projectName'
  | 'selectChains'
  | 'selectContracts'
  | 'selectFrontend'
  | 'selectDevOptions'
  | 'summary';


const CustomMultiSelect = ({ items, onSubmit }: { items: {label: string, value: string}[], onSubmit: (items: {label: string, value: string}[]) => void}) => {
    const [focusIndex, setFocusIndex] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useInput((input, key) => {
        if (key.upArrow) {
            setFocusIndex(Math.max(0, focusIndex - 1));
        }
        if (key.downArrow) {
            setFocusIndex(Math.min(items.length - 1, focusIndex + 1));
        }
        if (input === ' ') {
            const newSelected = new Set(selected);
            const item = items[focusIndex];
            if (newSelected.has(item.value)) {
                newSelected.delete(item.value);
            } else {
                newSelected.add(item.value);
            }
            setSelected(newSelected);
        }
        if (key.return) {
            onSubmit(items.filter(item => selected.has(item.value)));
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
            chains: [],
            contracts: {},
            devOptions: { inMemoryDb: false },
        });
        const [contractSelectionChainIndex, setContractSelectionChainIndex] = useState(0);
        const { exit } = useApp();

        const handleProjectNameSubmit = (projectName: string) => {
            setOptions(prev => ({ ...prev, projectName }));
            setStep('selectChains');
        };

        const handleChainsSubmit = (items: { label: string; value: Chain }[]) => {
            const selectedChains = items.map(i => i.value);
            setOptions(prev => ({ ...prev, chains: selectedChains }));
            if (selectedChains.length > 0) {
                setStep('selectContracts');
            } else {
                setStep('selectFrontend');
            }
        };

        const handleContractsSubmit = (items: { label: string; value: Contract }[]) => {
            const currentChain = options.chains![contractSelectionChainIndex];
            const selectedContracts = items.map(i => i.value);
            setOptions(prev => ({
                ...prev,
                contracts: {
                    ...prev.contracts,
                    [currentChain]: selectedContracts,
                },
            }));

            if (contractSelectionChainIndex + 1 < options.chains!.length) {
                setContractSelectionChainIndex(i => i + 1);
            } else {
                setStep('selectFrontend');
            }
        };

        const handleFrontendSelect = (item: { value: Frontend }) => {
            setOptions(prev => ({ ...prev, frontend: item.value }));
            setStep('selectDevOptions');
        };

        const handleDevOptionsSubmit = (items: { value: string }[]) => {
            setOptions(prev => ({
                ...prev,
                devOptions: {
                    ...prev.devOptions,
                    inMemoryDb: items.some(i => i.value === 'in-memory-db'),
                },
            }));
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
                    chains: [],
                    contracts: {},
                    devOptions: { inMemoryDb: false },
                });
                setContractSelectionChainIndex(0);
            }
        };

        switch (step) {
            case 'projectName':
                return (
                    <Box>
                        <Text>Enter project name: </Text>
                        <TextInput
                            value={options.projectName!}
                            onChange={(value: string) => setOptions(prev => ({...prev, projectName: value}))}
                            onSubmit={handleProjectNameSubmit}
                        />
                    </Box>
                );
            case 'selectChains':
                return (
                    <Box flexDirection="column">
                        <Text>Select chains (press space to select, enter to submit):</Text>
                        <CustomMultiSelect items={ALL_CHAINS} onSubmit={handleChainsSubmit} />
                    </Box>
                );
            case 'selectContracts': {
                const currentChain = options.chains![contractSelectionChainIndex];
                 return (
                    <Box flexDirection="column">
                        <Text>Select contracts for {currentChain} (press space to select, enter to submit):</Text>
                        <CustomMultiSelect items={ALL_CONTRACTS} onSubmit={handleContractsSubmit} />
                    </Box>
                );
            }
            case 'selectFrontend':
                return (
                    <Box flexDirection="column">
                        <Text>Select frontend framework:</Text>
                        <SelectInput items={ALL_FRONTENDS} onSelect={handleFrontendSelect} />
                    </Box>
                );
            case 'selectDevOptions':
                return (
                    <Box flexDirection="column">
                        <Text>Select dev options (press space to select, enter to submit):</Text>
                        <CustomMultiSelect items={[{ label: 'In-memory DB for development', value: 'in-memory-db' }]} onSubmit={handleDevOptionsSubmit} />
                    </Box>
                );
            case 'summary':
                return (
                    <Box flexDirection="column">
                        <Text>Summary:</Text>
                        <Text>Project Name: {options.projectName}</Text>
                        <Text>Chains: {options.chains!.join(', ')}</Text>
                        {options.chains!.map(chain => (
                            <Text key={chain}>
                                  Contracts for {chain}: {options.contracts![chain]?.join(', ') || 'none'}
                            </Text>
                        ))}
                        <Text>Frontend: {options.frontend}</Text>
                        <Text>In-memory DB: {options.devOptions!.inMemoryDb ? 'Yes' : 'No'}</Text>
                        <Text>Generate project?</Text>
                        <SelectInput items={[{label: 'Yes', value: 'yes'}, {label: 'No', value: 'no'}]} onSelect={handleConfirm} />
                    </Box>
                );
            default:
                return null;
        }
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
    const selector = new OptionsSelector();
    const options = await selector.getOptions();

    const generator = new ProjectGenerator(options);
    await generator.generate();

    console.log(`Project ${options.projectName} generated successfully!`);
}

main();
