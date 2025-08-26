import { useCallback, useEffect, useState } from "react";
import { fetchChainConfigs, initialChainConfigs } from "../config.ts";
import type { PaimaChains } from "../types/index.ts";

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

export function useBlockchainData() {
  const [chainConfigs, setChainConfigs] = useState<PaimaChains>({});
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [newBlockIndices, setNewBlockIndices] = useState<
    Record<string, number | undefined>
  >({});

  // Fetch latest block for RPC chains
  const fetchLatestBlockForChain = useCallback(async (chainKey: string) => {
    const config = chainConfigs[chainKey];
    if (config.type !== "EVM" || !config.rpcEndpoint) return;

    try {
      const response = await fetch(config.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }

      const blockNumber = parseInt(data.result, 16);

      setChainConfigs((prev: PaimaChains) => {
        const updated = { ...prev };
        const chainConfig = updated[chainKey];

        if (blockNumber > (chainConfig.latestBlockNumber || 0)) {
          chainConfig.previousLatestBlockNumber =
            chainConfig.latestBlockNumber || 0;
          chainConfig.latestBlockNumber = blockNumber;
          chainConfig.isConnected = true;

          // Generate new block when RPC block increments
          if (chainConfig.previousLatestBlockNumber > 0) {
            const blockHash = generateRandomHash();
            const timestamp = new Date();

            const newBlock = {
              number: blockNumber,
              hash: blockHash,
              timestamp: timestamp,
            };

            // Check if block already exists to prevent duplicates
            const blockExists = chainConfig.blocks.some(
              (block: Block) =>
                block.number === blockNumber && block.hash === blockHash,
            );

            if (!blockExists) {
              // Add to beginning of array
              chainConfig.blocks.unshift(newBlock);

              // Keep only last 20 blocks
              if (chainConfig.blocks.length > 20) {
                chainConfig.blocks = chainConfig.blocks.slice(0, 20);
              }

              // Set new block indicator
              setNewBlockIndices((prevIndices) => ({
                ...prevIndices,
                [chainKey]: 0,
              }));

              // Clear new block indicator after animation
              setTimeout(() => {
                setNewBlockIndices((prevIndices) => ({
                  ...prevIndices,
                  [chainKey]: undefined,
                }));
              }, 250);
            }
          }
        }

        return updated;
      });
    } catch (error) {
      console.error(`Error fetching latest block for ${chainKey}:`, error);
      setChainConfigs((prev: PaimaChains) => ({
        ...prev,
        [chainKey]: {
          ...prev[chainKey],
          isConnected: false,
        },
      }));
    }
  }, [chainConfigs]);

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
      setChainConfigs(initialChainConfigs);
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
            const timestamp = new Date(Date.now() + i * config.blockTime);

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

  // Setup intervals after configs are loaded
  useEffect(() => {
    // Don't setup intervals if we're still loading or have no configs
    if (isLoadingConfig || Object.keys(chainConfigs).length === 0) {
      return;
    }

    // Initialize chains with dummy blocks
    initializeChains(chainConfigs);

    // Setup block generators for non-RPC chains
    const blockIntervals: any[] = [];
    Object.keys(chainConfigs).forEach((chainKey) => {
      const config = chainConfigs[chainKey];
      if (!config.rpcEndpoint) {
        const interval = setInterval(() => {
          generateBlock(chainKey);
        }, config.blockTime);
        blockIntervals.push(interval);
      }
    });

    // Setup RPC polling for RPC chains
    const rpcIntervals: any[] = [];
    Object.keys(chainConfigs).forEach((chainKey) => {
      const config = chainConfigs[chainKey];
      if (config.type === "EVM" && config.rpcEndpoint) {
        // Fetch immediately
        fetchLatestBlockForChain(chainKey);

        // Setup polling interval
        const interval = setInterval(() => {
          fetchLatestBlockForChain(chainKey);
        }, 1000);
        rpcIntervals.push(interval);
      }
    });

    return () => {
      [...blockIntervals, ...rpcIntervals].forEach((interval) =>
        clearInterval(interval)
      );
    };
  }, [
    chainConfigs,
    isLoadingConfig,
    initializeChains,
    generateBlock,
    fetchLatestBlockForChain,
  ]); // React to config changes

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
