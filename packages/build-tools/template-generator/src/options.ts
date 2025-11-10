export const PAIMA_SCOPE = '@paimaexample';
export const PAIMA_VERSION = '0.3.104';

// Define types for the options
export type Chain = 'evm' | 'midnight' | 'cardano' | 'bitcoin' | 'avail';
export const ALL_CHAINS: { label: string; value: Chain }[] = [
  { label: 'EVM', value: 'evm' },
  { label: 'Midnight', value: 'midnight' },
  { label: 'Cardano', value: 'cardano' },
  { label: 'Bitcoin', value: 'bitcoin' },
  { label: 'Avail', value: 'avail' },
];

export const CONTRACTS_BY_CHAIN: Record<Chain, { label: string; value: string }[]> = {
    evm: [
        { label: 'ERC-20', value: 'erc-20' },
        { label: 'ERC-721', value: 'erc-721' },
        { label: 'ERC-1122', value: 'erc1122' },
        { label: 'Effect-Stream L2', value: 'effectstream-L2' },
        { label: 'Empty Contract', value: 'empty-contract' },
    ],
    midnight: [
        { label: 'Unshielded ERC-20', value: 'unshielded-erc20' },
        { label: 'Unshielded ERC-721', value: 'unshielded-erc721' },
        { label: 'Unshielded ERC-1155', value: 'unshielded-erc1155' },
        { label: 'Shielded ERC-20', value: 'shielded-erc20' },
        { label: 'Shielded ERC-721', value: 'shielded-erc721' },
        { label: 'Shielded ERC-1155', value: 'shielded-erc1155' },
        { label: 'Empty Contract', value: 'empty-contract' },
    ],
    cardano: [
        { label: 'Simple Token', value: 'simple-token' },
        { label: 'Empty Contract', value: 'empty-contract' },
    ],
    bitcoin: [
        { label: 'Empty Contract', value: 'empty-contract' },
    ],
    avail: [
        { label: 'Empty Contract', value: 'empty-contract' },
    ]
};

type EvmContracts = typeof CONTRACTS_BY_CHAIN['evm'][number]['value'];
type MidnightContracts = typeof CONTRACTS_BY_CHAIN['midnight'][number]['value'];
type CardanoContracts = typeof CONTRACTS_BY_CHAIN['cardano'][number]['value'];
type BitcoinContracts = typeof CONTRACTS_BY_CHAIN['bitcoin'][number]['value'];
type AvailContracts = typeof CONTRACTS_BY_CHAIN['avail'][number]['value'];

export type Contract = EvmContracts | MidnightContracts | CardanoContracts | BitcoinContracts | AvailContracts;


export type Frontend = 'intergrated-vite-deno' | 'standalone-esbuild';
export const ALL_FRONTENDS: { label: string; value: Frontend }[] = [
    { label: 'Integrated Vite (Deno)', value: 'intergrated-vite-deno' },
    { label: 'Standalone (esbuild)', value: 'standalone-esbuild' },
];

export const DEFAULT_DEV_OPTIONS = {
    inMemoryDb: true,
    useBatcher: true,
};
export type DevOptions = typeof DEFAULT_DEV_OPTIONS;


export type TemplateOptions = {
    projectName: string;
    folderPath: string;
    chains: Chain[];
    contracts: Partial<Record<Chain, Contract[]>>;
    frontends: Frontend[];
    devOptions: DevOptions;
};
