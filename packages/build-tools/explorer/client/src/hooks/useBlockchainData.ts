import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLOCK_HEIGHTS_ENDPOINT,
  fetchChainConfigs,
  SYNC_PROTOCOLS_ENDPOINT,
} from "../config.ts";
import type { PaimaChains } from "../types/index.ts";
import { blockWatcher } from "./BlockWatcher.ts";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

function generateRandomHash() {
  return "0x" +
    Array.from(
      { length: 64 },
      () => Math.floor(Math.random() * 16).toString(16),
    ).join("");
}

let paimaPollInterval: number = 1000;

// Helper function to create batch ranges
const createBatches = (
  start: number,
  end: number,
  batchSize: number,
): [number, number][] => {
  const batches: [number, number][] = [];
  for (let i = start; i <= end; i += batchSize) {
    const batchEnd = Math.min(i + batchSize - 1, end);
    batches.push([i, batchEnd]);
  }
  return batches;
};

// Helper function to fetch a batch of blocks
const fetchBlockBatch = async (
  protocol: string,
  from: number,
  to: number,
  chainType: string,
): Promise<{ number: number; hash: string; timestamp: Date }[]> => {
  const endpoint = from === to
    ? `${SYNC_PROTOCOLS_ENDPOINT}/${
      encodeURIComponent(protocol)
    }/blocks?page=${from}`
    : `${SYNC_PROTOCOLS_ENDPOINT}/${
      encodeURIComponent(protocol)
    }/blocks?from=${from}&to=${to}`;

  const resp = await fetch(endpoint);
  if (!resp.ok) {
    console.warn(
      `Failed to fetch blocks ${from}-${to} for ${protocol}: ${resp.status}`,
    );
    return [];
  }

  const data = await resp.json();
  const blocks = data?.blocks;

  if (!blocks || !Array.isArray(blocks)) return [];

  return blocks.map((block) => parseBlock(block, chainType, from)).filter((
    block,
  ): block is NonNullable<typeof block> => block !== null);
};

// Block parsing strategies for different chain types
const blockParsers = {
  EVM: (block: any) => ({
    number: Number(block.number),
    hash: block.hash ?? "",
    timestamp: block.timestamp != null
      ? new Date(Number(block.timestamp) * 1000)
      : new Date(),
  }),

  MIDNIGHT: (block: any) => {
    const headerNumberHex = block?.header?.number as string | undefined;
    const headerNumber = headerNumberHex
      ? parseInt(headerNumberHex, 16)
      : undefined;
    const number = Number(
      block.height ??
        (headerNumber !== undefined ? headerNumber : undefined),
    );

    return {
      number,
      hash: block.hash ?? block.header?.parentHash ?? "",
      timestamp: new Date(), // Default timestamp for now
    };
  },

  CARDANO: (block: any) => ({
    number: Number(
      block.block?.header?.height ?? block.header?.height,
    ),
    hash: block.block?.header?.hash ?? block.header?.hash ?? "",
    timestamp: new Date(Number(block.timestamp ?? 0)),
  }),

  DEFAULT: (block: any, defaultNumber: number) => ({
    number: Number(block.blockNumber ?? defaultNumber),
    hash: block.hash ?? "",
    timestamp: block.received_at != null
      ? new Date(Number(block.received_at))
      : new Date(),
  }),

  AVAIL: (block: any) => ({
    number: Number(block.number),
    hash: block.hash ?? "",
    timestamp: block.received_at != null
      ? new Date(Number(block.received_at))
      : new Date(),
  }),
} as const;

// Helper function to parse individual block based on chain type
const parseBlock = (
  blockPayload: any,
  chainType: string,
  defaultNumber: number,
): { number: number; hash: string; timestamp: Date } | null => {
  const parser = blockParsers[chainType as keyof typeof blockParsers] ??
    blockParsers.DEFAULT;
  const result = parser(blockPayload, defaultNumber);

  if (result.number == null || Number.isNaN(result.number)) return null;

  return result;
};

export function useBlockchainData() {
  const [chainConfigs, setChainConfigs] = useState<PaimaChains>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [newBlockIndices, setNewBlockIndices] = useState<
    Record<string, number | undefined>
  >({});
  const chainsInitializedRef = useRef(false);
  const nonRpcIntervalsStartedRef = useRef(false);
  const blockHeightsPollRef = useRef<number | null>(null);
  const lastProcessedPagesRef = useRef<Record<string, number>>({});

  // Generate a new block for a chain
  const generateBlock = useCallback(
    (chainKey: string, configs: PaimaChains = chainConfigs) => {
      const config = configs[chainKey];
      if (!config) return;

      const blockNumber = config.rpcEndpoint
        ? (config.latestBlockNumber || 0)
        : config.currentBlock++;
      const blockHash = generateRandomHash();
      const timestamp = new Date();

      const newBlock = {
        number: blockNumber,
        hash: blockHash,
        timestamp: timestamp,
      };

      setChainConfigs((prev: PaimaChains) => {
        const updated = { ...prev };
        const chainConfig = updated[chainKey];

        // Check if block already exists to prevent duplicates
        const blockExists = chainConfig.blocks.some(
          (block: Block) => block.number === blockNumber,
        );

        if (!blockExists) {
          // Add to beginning of array
          chainConfig.blocks.unshift(newBlock);

          // Keep only last 20 blocks
          if (chainConfig.blocks.length > 20) {
            chainConfig.blocks = chainConfig.blocks.slice(0, 20);
          }
        }

        return updated;
      });

      // Set new block indicator only if block was added
      setNewBlockIndices((prev) => ({
        ...prev,
        [chainKey]: 0,
      }));

      // Clear new block indicator after animation
      setTimeout(() => {
        setNewBlockIndices((prev) => ({
          ...prev,
          [chainKey]: undefined,
        }));
      }, 250);
    },
    [chainConfigs],
  );

  // Load chain configs from API
  const loadChainConfigs = useCallback(async () => {
    setIsLoadingConfig(true);
    setConfigError(null);

    try {
      const configs = await fetchChainConfigs();
      paimaPollInterval = configs.Paima.blockTime ?? 1000;
      setChainConfigs(configs);
      console.log("✅ Loaded chain configs from API:", configs);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      setConfigError(errorMessage);
      console.error(
        "❌ Failed to load chain configs, using fallback:",
        errorMessage,
      );
      setChainConfigs({});
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // Initialize chains with dummy blocks
  const initializeChains = useCallback((configs: PaimaChains) => {
    setChainConfigs((prev: PaimaChains) => {
      const updated = { ...prev };

      Object.keys(configs).forEach((chainKey) => {
        const config = updated[chainKey];
        if (!config) return;

        if (!config.rpcEndpoint) {
          // Generate 5 initial blocks for non-RPC chains
          const initialBlocks = [];

          for (let i = -5; i < 0; i++) {
            const blockNumber = config.currentBlock + i;
            const blockHash = generateRandomHash();
            const timestamp = new Date(
              Date.now() + i * (config.blockTime ?? 1000),
            );

            initialBlocks.push({
              number: blockNumber,
              hash: blockHash,
              timestamp: timestamp,
            });
          }

          config.blocks = initialBlocks.reverse();
          config.currentBlock = config.currentBlock + 1;
        }
      });

      return updated;
    });
  }, []);

  // Load configs on mount
  useEffect(() => {
    loadChainConfigs();
  }, [loadChainConfigs]);

  // One-time initialization of non-RPC chains with dummy blocks
  useEffect(() => {
    if (isLoadingConfig || chainsInitializedRef.current) return;
    if (Object.keys(chainConfigs).length === 0) return;
    initializeChains(chainConfigs);
    chainsInitializedRef.current = true;
  }, [isLoadingConfig]);

  // Start non-RPC block generators once after configs load
  useEffect(() => {
    if (isLoadingConfig || nonRpcIntervalsStartedRef.current) return;
    if (Object.keys(chainConfigs).length === 0) return;

    const blockIntervals: number[] = [];
    Object.keys(chainConfigs).forEach((chainKey) => {
      const config = chainConfigs[chainKey];
      if (!config.rpcEndpoint) {
        const id = setInterval(() => {
          generateBlock(chainKey);
        }, config.blockTime) as unknown as number;
        blockIntervals.push(id);
      }
    });

    nonRpcIntervalsStartedRef.current = true;
    return () => {
      blockIntervals.forEach((id) => clearInterval(id));
      nonRpcIntervalsStartedRef.current = false;
    };
  }, [isLoadingConfig]);

  // Start Paima RPC polling once after configs load
  useEffect(() => {
    if (isLoadingConfig) return;

    // This will implicitly initialize the blockWatcher
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockWatcher.waitForBlock("__main__");

    const interval = setInterval(() => {
      setChainConfigs((prev: PaimaChains) => {
        const updated = { ...prev };
        let changed = false;

        for (const chainKey in updated) {
          const config = updated[chainKey];
          const watcherChainKey = chainKey === "Paima"
            ? "__main__"
            : config.protocolName || chainKey;
          const blockNumber = blockWatcher.getLatestBlock(watcherChainKey);

          if (blockNumber > (config.latestBlockNumber || 0)) {
            changed = true;
            config.previousLatestBlockNumber = config.latestBlockNumber || 0;
            config.latestBlockNumber = blockNumber;
            config.isConnected = true;

            // Generate new block when block number increments
            if (config.previousLatestBlockNumber > 0) {
              const blockHash = generateRandomHash();
              const timestamp = new Date();

              const newBlock = {
                number: blockNumber,
                hash: blockHash,
                timestamp: timestamp,
              };

              const blockExists = config.blocks.some(
                (block: Block) =>
                  block.number === blockNumber,
              );

              if (!blockExists) {
                config.blocks.unshift(newBlock);

                if (config.blocks.length > 20) {
                  config.blocks = config.blocks.slice(0, 20);
                }

                // This state is separate, so need to call its setter
                setNewBlockIndices((prevIndices) => ({
                  ...prevIndices,
                  [chainKey]: 0,
                }));

                setTimeout(() => {
                  setNewBlockIndices((prevIndices) => ({
                    ...prevIndices,
                    [chainKey]: undefined,
                  }));
                }, 500);
              }
            }
          }
        }
        return changed ? { ...updated } : prev;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isLoadingConfig]);

  // Periodically fetch engine block-heights and sample last-synced blocks for non-Paima chains
  useEffect(() => {
    if (isLoadingConfig) return;
    if (blockHeightsPollRef.current != null) return;

    const computeInterval = () => {
      const entries = Object.entries(chainConfigs).filter(([k]) =>
        k !== "Paima"
      );
      let min = Number.POSITIVE_INFINITY;
      for (const [, cfg] of entries) {
        if (typeof cfg.blockTime === "number" && cfg.blockTime > 0) {
          if (cfg.blockTime < min) min = cfg.blockTime;
        }
      }
      if (!Number.isFinite(min)) return 10000;
      return Math.max(1000, min);
    };

    const tick = async () => {
      try {
        const res = await fetch(BLOCK_HEIGHTS_ENDPOINT);
        if (!res.ok) throw new Error(`block-heights HTTP ${res.status}`);
        const heights: {
          protocol_name: string;
          synced_page: number | null;
          fetched_page: number | null;
        }[] = await res.json();

        const updates: {
          key: string;
          blocks: { number: number; hash: string; timestamp: Date }[];
        }[] = [];

        for (const [key, cfg] of Object.entries(chainConfigs)) {
          if (key === "Paima") continue;
          const proto = cfg.protocolName;
          if (!proto) continue;
          const h = heights.find((x) => x.protocol_name === proto);
          if (!h || h.synced_page == null) continue;

          // Skip if we've already processed this synced_page
          const lastProcessed = lastProcessedPagesRef.current[proto] || 0;
          if (h.synced_page <= lastProcessed) continue;

          try {
            const allParsedBlocks: {
              number: number;
              hash: string;
              timestamp: Date;
            }[] = [];

            // We only want to fetch the latest blocks, not the entire history.
            const blockPayloads = await fetchBlockBatch(
              proto,
              h.synced_page,
              h.synced_page,
              cfg.type,
            );
            allParsedBlocks.push(...blockPayloads);

            if (allParsedBlocks.length > 0) {
              updates.push({
                key,
                blocks: allParsedBlocks,
              });

              // Update the last processed page for this protocol
              lastProcessedPagesRef.current[proto] = h.synced_page;
            }
          } catch (_) {
            // ignore errors for individual protocol fetches
          }
        }

        if (updates.length > 0) {
          setChainConfigs((prev: PaimaChains) => {
            const next = { ...prev };
            for (const u of updates) {
              const cfg = next[u.key];
              if (!cfg || !u.blocks || u.blocks.length === 0) continue;

              // Filter out blocks that already exist to avoid duplicates
              const newBlocks = u.blocks.filter((block) =>
                !cfg.blocks.some((existingBlock) =>
                  existingBlock.number === block.number
                )
              );

              if (newBlocks.length > 0) {
                // Sort blocks by number in descending order (most recent first)
                const sortedNewBlocks = newBlocks.sort((a, b) =>
                  b.number - a.number
                );

                // Add all new blocks to the beginning
                cfg.blocks.unshift(...sortedNewBlocks);

                // Keep only last 20 blocks
                if (cfg.blocks.length > 20) {
                  cfg.blocks = cfg.blocks.slice(0, 20);
                }
              }
            }
            return next;
          });
        }
      } catch (_) {
        // ignore errors for the overall heights tick
      }
    };

    // initial tick and interval
    tick();
    const intervalMs = computeInterval();
    console.log(
      `[Explorer] Engine block-heights polling interval resolved to ${intervalMs} ms`,
    );
    blockHeightsPollRef.current = setInterval(
      tick,
      intervalMs,
    ) as unknown as number;
    return () => {
      if (blockHeightsPollRef.current != null) {
        clearInterval(blockHeightsPollRef.current);
        blockHeightsPollRef.current = null;
      }
    };
  }, [isLoadingConfig]);

  // Get Paima chain data for backward compatibility
  // Always use the hardcoded Paima main chain first
  const paimaChain = chainConfigs.Paima;
  const latestBlock = paimaChain?.latestBlockNumber || 0;
  const isConnected = paimaChain?.isConnected || false;

  return {
    chainConfigs,
    newBlockIndices,
    latestBlock,
    isConnected,
    isLoadingConfig,
    configError,
  };
}
