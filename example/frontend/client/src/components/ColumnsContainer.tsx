import { BlockColumn } from "./BlockColumn.tsx";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface ChainConfig {
  type: string;
  name: string;
  blockTime: number;
  color: string;
  blocks: Block[];
  currentBlock: number;
  rpcEndpoint?: string;
  latestBlockNumber?: number;
  previousLatestBlockNumber?: number;
  isConnected?: boolean;
}

interface ColumnsContainerProps {
  chainConfigs: Record<string, ChainConfig>;
  newBlockIndices: Record<string, number | undefined>;
}

function calculateBlockTime(chainKey: string, config: ChainConfig): string {
  // if (
  //   config.type === "EVM" && config.rpcEndpoint && config.blocks.length >= 2
  // ) {
  //   const timeDiffs = [];
  //   for (let i = 0; i < Math.min(config.blocks.length - 1, 19); i++) {
  //     const timeDiff = config.blocks[i].timestamp.getTime() -
  //       config.blocks[i + 1].timestamp.getTime();
  //     timeDiffs.push(timeDiff);
  //   }

  //   if (timeDiffs.length > 0) {
  //     const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) /
  //       timeDiffs.length;
  //     return `${Math.round(avgTimeDiff / 1000 * 10) / 10}s`;
  //   }
  // }

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
