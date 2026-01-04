export const PAIMA_SCOPE = '@paimaexample';
export const EFFECTSTREAM_VERSION = "0.3.125";
import { evmContractOptions } from '@effectstream/evm-hardhat/scaffold';
import { availContractOptions } from '@effectstream/avail-contracts/scaffold';
import { cardanoContractOptions } from '@effectstream/cardano-contracts/scaffold';
import { midnightContractOptions } from '@effectstream/midnight-contracts/scaffold';

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
    evm: evmContractOptions,
    midnight: midnightContractOptions,
    cardano: cardanoContractOptions,
    // TODO Move to Bitcoin Contracts
    bitcoin: [ { label: 'Empty Contract', value: 'empty-contract' } ],
    avail: availContractOptions
};

type EvmContracts = typeof CONTRACTS_BY_CHAIN['evm'][number]['value'];
type MidnightContracts = typeof CONTRACTS_BY_CHAIN['midnight'][number]['value'];
type CardanoContracts = typeof CONTRACTS_BY_CHAIN['cardano'][number]['value'];
type BitcoinContracts = typeof CONTRACTS_BY_CHAIN['bitcoin'][number]['value'];
type AvailContracts = typeof CONTRACTS_BY_CHAIN['avail'][number]['value'];

export type Contract = EvmContracts | MidnightContracts | CardanoContracts | BitcoinContracts | AvailContracts;

export type Frontend = 'standalone-esbuild';

export const ALL_FRONTENDS: { label: string; value: Frontend }[] = [
    { label: 'Web Frontend', value: 'standalone-esbuild' },
];

export const DEFAULT_DEV_OPTIONS = {
    inMemoryDb: true,
    useBatcher: true,
    useExplorer: true,
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
