import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLOCK_HEIGHTS_ENDPOINT,
  fetchChainConfigs,
  initialChainConfigs,
  SYNC_PROTOCOLS_ENDPOINT,
} from "../config.ts";
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
  const [syncedSamplesLoaded, setSyncedSamplesLoaded] = useState(false);
  const paimaPollRef = useRef<number | null>(null);
  const rpcInFlightRef = useRef(false);
  const fetchLatestBlockForChainRef = useRef<(key: string) => void>(() => {});
  const chainsInitializedRef = useRef(false);
  const nonRpcIntervalsStartedRef = useRef(false);
  const blockHeightsPollRef = useRef<number | null>(null);

  // Fetch latest block for Paima main (EVM) only
  const fetchLatestBlockForChain = useCallback(async (chainKey: string) => {
    // Only allow RPC polling for Paima main chain
    if (chainKey !== "Paima") return;
    const config = chainConfigs[chainKey];
    if (!config) return;
    if (!config.rpcEndpoint) return;
    if (config.type !== "EVM") return;

    if (rpcInFlightRef.current) return;
    rpcInFlightRef.current = true;
    try {
      // Use Ethereum RPC method for EVM chain
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

      const blockNumber: number = parseInt(data.result, 16);

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
              }, 500);
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
    } finally {
      rpcInFlightRef.current = false;
    }
  }, [chainConfigs]);

  useEffect(() => {
    fetchLatestBlockForChainRef.current = fetchLatestBlockForChain;
  }, [fetchLatestBlockForChain]);

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
    console.log("🔄 Starting Paima RPC polling");
    if (isLoadingConfig) return;
    if (paimaPollRef.current != null) return;

    // Immediate fetch
    fetchLatestBlockForChainRef.current("Paima");
    paimaPollRef.current = setInterval(() => {
      fetchLatestBlockForChainRef.current("Paima");
    }, 10000);

    return () => {
      if (paimaPollRef.current != null) {
        clearInterval(paimaPollRef.current);
        paimaPollRef.current = null;
      }
    };
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
          block: { number: number; hash: string; timestamp: Date } | null;
        }[] = [];

        for (const [key, cfg] of Object.entries(chainConfigs)) {
          if (key === "Paima") continue;
          const proto = cfg.protocolName;
          if (!proto) continue;
          const h = heights.find((x) => x.protocol_name === proto);
          if (!h || h.synced_page == null) continue;

          try {
            const resp = await fetch(
              `${SYNC_PROTOCOLS_ENDPOINT}/${
                encodeURIComponent(proto)
              }/blocks?page=${h.synced_page}`,
            );
            if (!resp.ok) throw new Error(`blocks HTTP ${resp.status}`);
            const data = await resp.json();
            const blockPayload = data?.blocks?.[0];
            if (!blockPayload) continue;

            let number: number | null = null;
            let hash: string | null = null;
            let tsMs: number | null = null;

            if (cfg.type === "EVM") {
              number = Number(blockPayload.number);
              hash = blockPayload.hash;
              tsMs = blockPayload.timestamp != null
                ? Number(blockPayload.timestamp) * 1000
                : null;
            } else if (cfg.type === "MIDNIGHT") {
              const headerNumberHex = blockPayload?.header?.number as
                | string
                | undefined;
              const headerNumber = headerNumberHex
                ? parseInt(headerNumberHex, 16)
                : undefined;
              number = Number(
                blockPayload.height ??
                  (headerNumber !== undefined ? headerNumber : undefined),
              );
              hash = blockPayload.hash ?? blockPayload.header?.parentHash ?? "";
              tsMs = null;
            } else if (cfg.type === "CARDANO") {
              number = Number(
                blockPayload.block?.header?.height ??
                  blockPayload.header?.height,
              );
              hash = blockPayload.block?.header?.hash ??
                blockPayload.header?.hash ?? "";
              tsMs = Number(blockPayload.timestamp ?? 0);
            } else {
              number = Number(blockPayload.blockNumber ?? h.synced_page);
              hash = blockPayload.hash ?? "";
              tsMs = blockPayload.timestamp != null
                ? Number(blockPayload.timestamp)
                : null;
            }

            if (number != null && !Number.isNaN(number)) {
              updates.push({
                key,
                block: {
                  number,
                  hash: hash ?? "",
                  timestamp: tsMs ? new Date(tsMs) : new Date(),
                },
              });
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
              if (!cfg || !u.block) continue;
              const exists = cfg.blocks.some((b) =>
                b.number === u.block!.number
              );
              if (!exists) {
                cfg.blocks.unshift(u.block);
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
