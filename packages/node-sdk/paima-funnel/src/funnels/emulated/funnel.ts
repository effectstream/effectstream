import type { PoolClient } from 'pg';
import Prando from '@paima/prando';
import type { ChainFunnel, FunnelJson, ReadPresyncDataFrom } from '@paima/runtime';
import type { ChainData, EvmPresyncChainData, PresyncChainData } from '@paima/sm';
import { FUNNEL_PRESYNC_FINISHED, ENV, GlobalConfig, doLog, caip2PrefixFor } from '@paima/utils';
import type { AvailMainConfig, MainEvmConfig } from '@paima/utils';
import {
  emulatedSelectLatestPrior,
  upsertEmulatedBlockheight,
  getBlockHeights,
  getLatestProcessedBlockHeight,
} from '@paima/db';
import type { IGetBlockHeightsResult } from '@paima/db';
import { hashTogether } from '@paima/utils-backend';

import { calculateBoundaryTimestamp, emulateCde, timestampToBlockNumber } from './utils.js';
import { BaseFunnel } from '../BaseFunnel.js';
import type { FunnelSharedData } from '../BaseFunnel.js';
import { QueuedBlockCacheEntry, RpcCacheEntry, RpcRequestState } from '../FunnelCache.js';
import type { ChainInfo } from '../../utils.js';

/**
 * For hash calculation of empty blocks to work,
 * all of the prior emulated blocks must have already been processed by SM
 * Notably, their corresponding seeds must have been calculated and stored in the DB.
 *
 * To still be able to process things in parallel, we provide a batch option
 * but note the batching will affect:
 * - which how old the blocks that feed into the hash will be
 * - the hash of the blocks (aka changing this batch size is a hardfork for games
 *
 * Based on my my machine, batch of `100` is about 10~20% faster than batch of `1`.
 */
const MAX_BATCH_SIZE = 100;

type CtorData = {
  /** Timestamp of the block where the game should start syncing */
  readonly startTimestamp: number;
  /** Max amount of time (in seconds) to wait to close a time interval and create an emulated block */
  readonly maxWait: number;
  readonly baseFunnel: ChainFunnel;
};
export class EmulatedBlocksFunnel extends BaseFunnel {
  protected constructor(
    sharedData: FunnelSharedData,
    dbTx: PoolClient,
    private readonly ctorData: CtorData,
    private dcState: {
      /** Block number of the underlying DC */
      latestFetchedBlockNumber: number;
      /** Timestamp of the latest block of the underlying DC */
      latestFetchedTimestamp: number;
    },
    private emulatedState: {
      /** Block height (not timestamp) representing the latest emulated block */
      latestEmulatedBlockNumber: number;
      /** The lower bound of any timestamp the funnel will accept */
      timestampLowerBound: number;
    },
    /** Blocks queued to be added into the current batch */
    private readonly processingQueue: ChainData[],

    /**
     * TODO: This is bad. This should NOT be passed to the emulated funnel
     *       It should work with an arbitrary chain
     */
    private readonly chainInfo: ChainInfo<MainEvmConfig | AvailMainConfig>
  ) {
    super(sharedData, dbTx);
    // TODO: replace once TS5 decorators are better supported
    this.readData.bind(this);
    this.readPresyncData.bind(this);
    this.getDbTx.bind(this);
    this.configPrint.bind(this);
  }

  /**
   * Recall: for emulated blocks, this is called with blockHeight 1 for the initial sync
   */
  public override async readData(blockHeight: number): Promise<ChainData[]> {
    // EmulatedBlocksFunnel only supports syncing blocks sequentially (no arbitrary reads)
    if (blockHeight != this.emulatedState.latestEmulatedBlockNumber + 1) {
      throw new Error(
        `[EBP] Unexpected EBH ${blockHeight} after latest ${this.emulatedState.latestEmulatedBlockNumber} with no data in DB to fall back on`
      );
    }

    // 1) Check if time interval is complete. If yes, return the emulated block
    //    Do this in batch to speed up the initial sync
    {
      const completedBlocks = await this.getNextBlockBatch(blockHeight);
      if (completedBlocks.length > 0) {
        this.logRange(completedBlocks);
        return completedBlocks;
      }
    }

    // 2) If time interval is not complete, queue any new DC block that might have been made
    try {
      while (true) {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const fetchedData = await this.ctorData.baseFunnel.readData(
          this.dcState.latestFetchedBlockNumber + 1
        );

        const latestAvailableBlockNumber = this.sharedData.cacheManager.cacheEntries[
          RpcCacheEntry.SYMBOL
        ]?.getState(caip2PrefixFor(this.chainInfo.config));
        if (latestAvailableBlockNumber?.state !== RpcRequestState.HasResult)
          throw new Error(`latestAvailableBlockNumber missing from cache for ${ENV.CHAIN_ID}`);

        // check if the chunk we read matches the latest block known by the RPC endpoint
        // or if there are no blocks left to fetch as we're already at the tip
        const synced =
          fetchedData.length > 0
            ? fetchedData[fetchedData.length - 1].blockNumber >= latestAvailableBlockNumber.result
            : true;

        await this.feedData(currentTimestamp, fetchedData, synced);

        // it's possible that while syncing, we hit a period where there are a lot of blocks
        // but all the blocks are in a timestamp range smaller than ENV.BLOCK_TIME (esp. on Arbitrum)
        // to avoid returning nothing from the funnel in this case, we instead go back and fetch more blocks
        {
          if (synced) break;
          if (fetchedData.length === 0) break;
          const queueTimeRange =
            fetchedData[fetchedData.length - 1].timestamp - fetchedData[0].timestamp;
          if (queueTimeRange >= ENV.BLOCK_TIME) {
            break;
          }
        }
      }
    } catch (err) {
      doLog(`[paima-funnel::readData] Exception occurred while reading blocks: ${err}`);
      throw err;
    }

    // 3) See if syncing the DC chains allows us to close out this emulated block
    //    This happens if we find a DC block whose timestamp occurs after the end of this range
    const blocks = await this.getNextBlockBatch(blockHeight);
    this.logRange(blocks);
    return blocks;
  }

  logRange = (blocks: ChainData[]): void => {
    if (blocks.length === 0) {
      return;
    } else if (blocks.length === 1) {
      // padding with "-timestamp" so that the logs are the same size no matter which branch
      // this just makes console outputs easier to read
      const paddingLength = blocks[0].timestamp.toString().length + 1;
      doLog(
        `Emulated funnel ${ENV.CHAIN_ID}: ${blocks[0].timestamp}${' '.repeat(paddingLength)} \t [${
          blocks[0].timestamp - ENV.BLOCK_TIME
        }~${blocks[0].timestamp})`
      );
    } else {
      doLog(
        `Emulated funnel ${ENV.CHAIN_ID}: ${blocks[0].timestamp}-${
          blocks[blocks.length - 1].timestamp
        } \t [${blocks[0].timestamp - ENV.BLOCK_TIME}~${blocks[blocks.length - 1].timestamp})`
      );
    }
  };

  public override async readPresyncData(
    args: ReadPresyncDataFrom
  ): Promise<{ [caip2: string]: PresyncChainData[] | typeof FUNNEL_PRESYNC_FINISHED }> {
    // map base funnel data to the right timestamp range
    const baseData = await this.ctorData.baseFunnel.readPresyncData(args);

    const baseDataMainEvm = baseData[this.chainInfo.name];

    if (!baseDataMainEvm || baseDataMainEvm === FUNNEL_PRESYNC_FINISHED) {
      return baseData;
    }

    baseData[this.chainInfo.name] = baseDataMainEvm.map(data => {
      const timestamp = calculateBoundaryTimestamp(
        this.ctorData.startTimestamp,
        ENV.BLOCK_TIME,
        (data as EvmPresyncChainData).blockNumber
      );
      return {
        ...data,
        blockNumber: timestampToBlockNumber(
          this.ctorData.startTimestamp,
          ENV.BLOCK_TIME,
          timestamp
        ),
      };
    });

    return baseData;
  }

  /**
   * Validate and prepare the next batch of deployment chain blocks for processing
   *
   * @param currentTimestamp -- timestamp in seconds at the time of fetching the blocks
   * @param fetchedBlocks
   * @param synced -- true if the game node state has caught up with the latest deployment chain state
   */
  private feedData = async (
    currentTimestamp: number,
    fetchedBlocks: ChainData[],
    synced: boolean
  ): Promise<void> => {
    if (fetchedBlocks.length > 0) {
      this.validateFetchedBlocks(fetchedBlocks);
      this.processingQueue.push(...fetchedBlocks);

      const latestBlock = fetchedBlocks[fetchedBlocks.length - 1];
      this.dcState.latestFetchedBlockNumber = latestBlock.blockNumber;
      this.dcState.latestFetchedTimestamp = latestBlock.timestamp;
    }

    const latestTimestamp = this.dcState.latestFetchedTimestamp;

    // increase the lower-bound slowly as time passes, and skip forward if we see a new block
    // Note: we only take maxWait into account if we've already fully synced the chain
    //       otherwise, currentTimestamp would always be too high for historical blocks
    // Note: this only runs AFTER the underlying funnel has successfully completed
    //       that means timestampLowerBound does not change if the underlying funnel threw an error (such as an RPC error)
    const awaitedThreshold = currentTimestamp - this.ctorData.maxWait;
    this.emulatedState.timestampLowerBound = synced
      ? Math.max(latestTimestamp, awaitedThreshold)
      : latestTimestamp;
  };

  public static async recoverState(
    sharedData: FunnelSharedData,
    ctorData: CtorData,
    dbTx: PoolClient,
    startBlockHeight: number
  ): Promise<EmulatedBlocksFunnel> {
    // default values
    let dcState = {
      latestFetchedBlockNumber: startBlockHeight - 1,
      latestFetchedTimestamp: ctorData.startTimestamp,
    };
    let emulatedState = {
      latestEmulatedBlockNumber: 0,
      // picked so that getNextBlock does not execute until startTimestamp passes
      timestampLowerBound: ctorData.startTimestamp - 1,
    };

    // get processing queue from cache
    const processingQueue = ((): ChainData[] => {
      const result =
        sharedData.cacheManager.cacheEntries[QueuedBlockCacheEntry.SYMBOL]?.processingQueue;
      if (result != null) {
        return result;
      }
      const newEntry = new QueuedBlockCacheEntry();
      sharedData.cacheManager.cacheEntries[QueuedBlockCacheEntry.SYMBOL] = newEntry;
      return newEntry.processingQueue;
    })();

    // TODO: we should be using the config of the funnel we wrap, not the main config
    const [chainName, config] = await GlobalConfig.mainConfig();

    const [b] = await getLatestProcessedBlockHeight.run(undefined, dbTx);
    if (!b) {
      return new EmulatedBlocksFunnel(
        sharedData,
        dbTx,
        ctorData,
        dcState,
        emulatedState,
        processingQueue,
        { name: chainName, config }
      );
    }

    const blockHeight = b.block_height;
    const [res] = await emulatedSelectLatestPrior.run({ emulated_block_height: blockHeight }, dbTx);
    if (!res) {
      throw new Error(`[funnel] Invalid DB state to recover emulated block state!`);
    }

    dcState = {
      latestFetchedBlockNumber: Math.max(
        res.deployment_chain_block_height,
        processingQueue[processingQueue.length - 1]?.blockNumber ?? 0
      ),
      latestFetchedTimestamp: Math.max(
        Number(res.second_timestamp),
        processingQueue[processingQueue.length - 1]?.timestamp ?? 0
      ),
    };
    emulatedState = {
      latestEmulatedBlockNumber: b.block_height,
      // assumed not synced to tip for now. This will be corrected in readData if needed
      timestampLowerBound: dcState.latestFetchedTimestamp,
    };

    return new EmulatedBlocksFunnel(
      sharedData,
      dbTx,
      ctorData,
      dcState,
      emulatedState,
      processingQueue,
      { name: chainName, config }
    );
  }

  private async getNextBlockBatch(blockHeight: number): Promise<ChainData[]> {
    const completedBlocks: ChainData[] = [];
    let nextBlock: ChainData | undefined = undefined;

    // we treat the genesis block as a special case
    // since we want to ensure there is at least always the genesis block in the DB before we add more blocks
    const scanSize = blockHeight === 1 ? 1 : MAX_BATCH_SIZE;
    for (let i = 0; i < scanSize; i++) {
      try {
        nextBlock = await this.getNextBlock();
        // errors from the above could mean invalid state, but also simply DB error
        if (nextBlock == null) break;
        completedBlocks.push(nextBlock);
      } catch (err) {
        doLog(`[paima-funnel::readData] Exception occurred while building next block: ${err}`);
        throw err;
      }
    }
    return completedBlocks;
  }

  /**
   * Process the deployment chain blocks waiting in the processing queue and return
   * the next emulated block, if it can already be constructed.
   *
   * @returns the next emulated block if possible, `undefined` otherwise (if deployment chain data not yet available)
   */
  private getNextBlock = async (): Promise<ChainData | undefined> => {
    const nextBlockBlockNumber = this.emulatedState.latestEmulatedBlockNumber + 1;
    const nextBlockEndTimestamp = calculateBoundaryTimestamp(
      this.ctorData.startTimestamp,
      ENV.BLOCK_TIME,
      nextBlockBlockNumber
    );
    // this will be false in two cases:
    // 1. timestampLowerBound gets updated by a new block that is after nextBlockEndTimestamp
    //    so we know for sure there won't be a new block for this interval
    // 2. (currentTimestamp - this.maxWait) has exceeded the end of the interval
    //    so we assume no other block will come in
    // Note: > and not >= because the end timestamp is non-exclusive
    //       ex: for [0~3), nextBlockEndTimestamp=3
    //           so if we see timestampLowerBound=3
    //           we can close this block since 3 is not part of the [0~3) range
    if (nextBlockEndTimestamp > this.emulatedState.timestampLowerBound) {
      return undefined;
    }

    const nextBlockStartTimestamp = calculateBoundaryTimestamp(
      this.ctorData.startTimestamp,
      ENV.BLOCK_TIME,
      nextBlockBlockNumber - 1
    );
    this.emulatedState.latestEmulatedBlockNumber = nextBlockBlockNumber;

    // we only want to pop off the queue the entries that correspond for the next ChainData
    // for the rest, we leave them in the queue to be fetched in the next readData call
    const mergedBlocks: ChainData[] = [];
    while (
      this.processingQueue.length > 0 &&
      this.processingQueue[0].timestamp < nextBlockEndTimestamp
    ) {
      const block = this.processingQueue.shift();
      if (block) {
        if (block.timestamp < nextBlockStartTimestamp) {
          throw new Error(
            `[funnel] DC block #${block.blockNumber} with timestamp ${block.timestamp} found out of order (EB timestamp ${nextBlockStartTimestamp}). Please resync your game node from the latest snapshot.`
          );
        }
        mergedBlocks.push(block);
      }
    }

    const nextBlockBlockHash = await this.calculateHash(mergedBlocks, nextBlockBlockNumber);
    const nextBlockSubmittedData = mergedBlocks.map(block => block.submittedData).flat();
    const nextBlockExtensionDatums = emulateCde(
      mergedBlocks.map(block => block.extensionDatums ?? []),
      nextBlockBlockNumber
    );
    const nextBlockInternalEvents = mergedBlocks.map(block => block.internalEvents || []).flat();

    // if this emulated block contains multiple blocks in the underlying chain
    if (mergedBlocks.length > 0) {
      const emulatedBlockheights = mergedBlocks.map(block => ({
        deployment_chain_block_height: block.blockNumber,
        second_timestamp: block.timestamp.toString(10),
        emulated_block_height: nextBlockBlockNumber,
      }));
      const params = { items: emulatedBlockheights };
      await upsertEmulatedBlockheight.run(params, this.dbTx);
    }

    return {
      blockNumber: nextBlockBlockNumber,
      blockHash: nextBlockBlockHash,
      timestamp: nextBlockEndTimestamp,
      submittedData: nextBlockSubmittedData,
      extensionDatums: nextBlockExtensionDatums,
      internalEvents: nextBlockInternalEvents,
    };
  };

  /**
   * Check that all blocks are:
   * 1. In correct timestamp order
   * 2. In correct block number order
   */
  private validateFetchedBlocks = (fetchedBlocks: ChainData[]): void => {
    let latestTimestamp = this.dcState.latestFetchedTimestamp;
    let latestBlockNumber = this.dcState.latestFetchedBlockNumber;
    for (const block of fetchedBlocks) {
      // note: don't check for timestamp equality
      //       as some chains like Arbitrum have multiple blocks with the same timestamp
      if (block.timestamp < latestTimestamp) {
        throw new Error(`Unexpected timestamp ${block.timestamp} in block ${block.blockNumber}`);
      }
      latestTimestamp = block.timestamp;
      if (block.blockNumber != latestBlockNumber + 1) {
        throw new Error(
          `Unexpected block number ${block.blockNumber} after block ${latestBlockNumber}`
        );
      }
      latestBlockNumber = block.blockNumber;
    }
  };

  private calculateHash = async (
    mergedBlocks: ChainData[],
    blockNumber: number
  ): Promise<string> => {
    if (mergedBlocks.length > 0) {
      return hashTogether(mergedBlocks.map(b => b.blockHash));
    }

    if (blockNumber <= 1) {
      throw new Error(`No blocks or prior seeds, unable to generate block hash!`);
    }
    const baseSeedHeight = Math.max(1, blockNumber - MAX_BATCH_SIZE);
    const baseSeedBlock: IGetBlockHeightsResult | undefined = (
      await getBlockHeights.run({ block_heights: [baseSeedHeight] }, this.dbTx)
    )[0];
    if (!baseSeedBlock.seed) {
      throw new Error(
        `Error during ${blockNumber}: Unable to get seed for blockheight ${baseSeedHeight}`
      );
    }
    const prandoSeed = hashTogether([blockNumber.toString(10), baseSeedBlock.seed]);
    const rng = new Prando(prandoSeed);

    const heights = new Set<number>();
    const NUM_SEEDS = 20;
    for (let i = 0; i < NUM_SEEDS; i++) {
      const upperRange = Math.max(1, blockNumber - MAX_BATCH_SIZE);
      heights.add(rng.nextInt(1, upperRange));
    }
    const randomPriorHashes = await getBlockHeights.run(
      { block_heights: Array.from(heights) },
      this.dbTx
    );
    if (randomPriorHashes.length !== heights.size) {
      throw new Error(
        `Error during ${blockNumber}: Unable to get random seed for blockheight ${JSON.stringify(
          randomPriorHashes
        )}`
      );
    }
    return hashTogether([blockNumber.toString(10), ...randomPriorHashes.map(block => block.seed)]);
  };

  public override configPrint(): FunnelJson {
    return {
      type: 'EmulatedBlocksFunnel',
      chainName: this.chainInfo.name,
      child: this.ctorData.baseFunnel.configPrint(),
    };
  }
}
