import type { ChainConfig, PaimaChains } from "../types/index.ts";
import { BlockColumn } from "./BlockColumn.tsx";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface ColumnsContainerProps {
  chainConfigs: PaimaChains;
  newBlockIndices: Record<string, number | undefined>;
}

function calculateBlockTime(chainKey: string, config: ChainConfig): string {
  return `${config.blockTime / 1000}s`;
}

export function ColumnsContainer(
  { chainConfigs, newBlockIndices }: ColumnsContainerProps,
) {
  return (
    <div className="columns-container">
      {Object.entries(chainConfigs).map(([chainKey, config]) => (
        <BlockColumn
          key={chainKey}
          title={config.name}
          blockTime={calculateBlockTime(chainKey, config)}
          blocks={config.blocks}
          isMainColumn={chainKey === "paima"}
          newBlockIndex={newBlockIndices[chainKey]}
        />
      ))}
    </div>
  );
}
