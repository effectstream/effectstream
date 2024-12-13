import process from 'process';
import { doLog, logError, delay, GlobalConfig, ENV, wait, caip2PrefixFor } from '@paima/utils';
import {
  tx,
  DataMigrations,
  emulatedBlockheightToDeploymentChain,
  deploymentChainBlockheightToEmulated,
  emulatedSelectLatestPrior,
} from '@paima/db';
import { getEarliestStartBlockheight, getEarliestStartSlot } from './cde-config/utils.js';
import type { ChainFunnel, IFunnelFactory, ReadPresyncDataFrom } from './types.js';
import type { ChainData, ChainDataExtension, GameStateMachine } from '@paima/sm';
import { run } from './run-flag.js';
import { snapshotIfTime } from './snapshots.js';
import {
  TimeoutError,
  acquireLatestBlockHeight,
  exitIfStopped,
  loopIfStopBlockReached,
} from './utils.js';
import { cleanNoncesIfTime } from './nonce-gc.js';
import type { PoolClient } from 'pg';
import { FUNNEL_PRESYNC_FINISHED, ConfigNetworkType } from '@paima/utils';
import type { CardanoConfig, EvmConfig } from '@paima/utils';
import { BuiltinEvents, PaimaEventManager } from '@paima/events';
import { PaimaEventBroker } from '@paima/broker';

// The core logic of paima runtime which polls the funnel and processes the resulting chain data using the game's state machine.
// Of note, the runtime is designed to continue running/attempting to process the next required block no matter what errors propagate upwards.
// This is a good approach in the case of networking problems or other edge cases which address themselves over time, and ensuring that the game node never goes offline.
// However of note, it is possible for the game node to get into a "soft-lock" state if the game state machine is badly coded and has uncaught exceptions which cause
// the runtime to continuously retry syncing the same block, and failing each time.
export async function startRuntime(
  gameStateMachine: GameStateMachine,
  funnelFactory: IFunnelFactory,
  pollingRate: number,
  startBlockHeight: number,
  stopBlockHeight: number | null,
  emulatedBlocks: boolean
): Promise<void> {
  const pollingPeriod = pollingRate * 1000;

  // Enable broker
  await startMQTTBroker();

  // Presync:
  await runPresync(
    gameStateMachine,
    funnelFactory,
    pollingPeriod,
    startBlockHeight,
    emulatedBlocks ? null : stopBlockHeight
  );

  // Main sync:
  await runSync(gameStateMachine, funnelFactory, pollingPeriod, stopBlockHeight);

  process.exit(0);
}

async function runPresync(
  gameStateMachine: GameStateMachine,
  funnelFactory: IFunnelFactory,
  pollingPeriod: number,
  startBlockHeight: number,
  stopBlockHeight: number | null
): Promise<void> {
  const networks = await GlobalConfig.getInstance();

  let presyncBlockHeight = await getPresyncStartBlockheight(
    gameStateMachine,
    funnelFactory.getExtensions(),
    startBlockHeight
  );

  if (run) {
    doLog('---------------------------\nBeginning Presync\n---------------------------');
  }
  while (run && Object.keys(presyncBlockHeight).length !== 0) {
    const upper = Object.fromEntries(
      await Promise.all<Promise<[caip2: string, number]>[]>(
        Object.entries(presyncBlockHeight)
          .filter(([_caip2, h]) => h >= 0)
          .map(
            async ([caip2, h]): Promise<[caip2: string, number]> => [
              caip2,
              h +
                ((await GlobalConfig.networkForCaip2(caip2))![1] as EvmConfig | CardanoConfig)
                  .presyncStepSize -
                1,
            ]
          )
      )
    );

    for (const network of Object.keys(networks)) {
      const caip2 = caip2PrefixFor(networks[network]);
      if (presyncBlockHeight[caip2] === Number.MAX_SAFE_INTEGER) {
        continue;
      }

      if (upper[caip2] > presyncBlockHeight[caip2]) {
        doLog(
          `[paima-runtime] Fetching data from ${network} in range: ${presyncBlockHeight[caip2]}-${upper[caip2]}`
        );
      } else if (presyncBlockHeight[network]) {
        doLog(
          `[paima-runtime] Fetching data from ${network} in block: ${presyncBlockHeight[caip2]}`
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-loop-func
    const maybePresyncBlockHeight = await tx(gameStateMachine.getReadWriteDbConn(), async dbTx => {
      const chainFunnel = await funnelFactory.generateFunnel(dbTx);
      return await runPresyncRound(
        gameStateMachine,
        chainFunnel,
        pollingPeriod,
        Object.entries(presyncBlockHeight).map(([caip2, height]) => ({
          caip2,
          from: height,
          to: upper[caip2],
        }))
      );
    });

    if (maybePresyncBlockHeight) {
      presyncBlockHeight = maybePresyncBlockHeight;
    } else {
      break;
    }
  }

  for (const network of Object.keys(networks)) {
    const caip2 = caip2PrefixFor(networks[network]);
    await loopIfStopBlockReached(presyncBlockHeight[caip2], stopBlockHeight);

    const latestPresyncBlockheight = await gameStateMachine.getPresyncBlockHeight(caip2);
    doLog(`[paima-runtime] Presync for ${network} finished at ${latestPresyncBlockheight}`);
  }
}

async function getPresyncStartBlockheight(
  gameStateMachine: GameStateMachine,
  CDEs: ChainDataExtension[],
  maximumPresyncBlockheight: number
): Promise<{ [caip2: string]: number }> {
  const config = await GlobalConfig.getInstance();

  const result: { [network: string]: number } = {};

  for (const network of Object.keys(config)) {
    if (
      config[network].type === ConfigNetworkType.CARDANO ||
      config[network].type === ConfigNetworkType.MINA
    ) {
      continue;
    }

    // avail doesn't have extensions
    const earliestCdeSbh =
      config[network].type === ConfigNetworkType.AVAIL_MAIN
        ? 1
        : getEarliestStartBlockheight(CDEs, network);

    const freshPresyncStart = earliestCdeSbh >= 0 ? earliestCdeSbh : maximumPresyncBlockheight + 1;

    const caip2 = caip2PrefixFor(config[network]);
    result[caip2] = freshPresyncStart;

    const latestPresyncBlockheight = await gameStateMachine.getPresyncBlockHeight(caip2);

    if (latestPresyncBlockheight > 0) {
      result[caip2] = latestPresyncBlockheight + 1;
    }
  }

  return result;
}

async function runPresyncRound(
  gameStateMachine: GameStateMachine,
  chainFunnel: ChainFunnel,
  pollingPeriod: number,
  from: ReadPresyncDataFrom
): Promise<{ [caip2: string]: number }> {
  const latestPresyncDataList = await chainFunnel.readPresyncData(from);

  if (!latestPresyncDataList || Object.values(latestPresyncDataList).every(l => l.length === 0)) {
    await delay(pollingPeriod);
    return Object.fromEntries(from.map(({ caip2, from }) => [caip2, from])) as Record<
      string,
      number
    >;
  }

  const finished = Object.values(latestPresyncDataList).every(data => {
    return data === FUNNEL_PRESYNC_FINISHED;
  });

  const filteredPresyncDataList = Object.values(latestPresyncDataList)
    .flatMap(data => (data !== FUNNEL_PRESYNC_FINISHED ? data : []))
    // for cardano keep the empty list, used to update the slot range lower bound
    .filter(
      unit =>
        (unit.networkType !== ConfigNetworkType.EVM &&
          unit.networkType !== ConfigNetworkType.EVM_OTHER) ||
        unit.extensionDatums.length > 0
    );

  const dbTx = chainFunnel.getDbTx();

  for (const presyncData of filteredPresyncDataList) {
    await gameStateMachine.presyncProcess(dbTx, presyncData);
  }

  if (!finished) {
    return Object.fromEntries(
      from.map(from => {
        if (latestPresyncDataList[from.caip2] === FUNNEL_PRESYNC_FINISHED) {
          // we need to keep calling the presync function, but the carp funnel
          // is not using the parameter anymore,since it handles pagination per
          // cde, instead of a global pace. This is set as placeholder, since
          // the block funnel will just keep returning that the presync is
          // finished.
          return [from.caip2, Number.MAX_SAFE_INTEGER];
        } else {
          return [from.caip2, from.to + 1];
        }
      })
    );
  } else {
    return {};
  }
}

async function runSync(
  gameStateMachine: GameStateMachine,
  funnelFactory: IFunnelFactory,
  pollingPeriod: number,
  stopBlockHeight: number | null
): Promise<void> {
  if (run) {
    doLog(
      '-------------------------------------\nBeginning Syncing & Processing Blocks\n-------------------------------------'
    );
  }

  while (run) {
    // Initializing the latest read block height and snapshotting
    // do not use a DB transaction, as we need to generate a snapshot
    const latestProcessedBlockHeight = await getSyncRoundStart(
      gameStateMachine,
      pollingPeriod,
      stopBlockHeight
    );
    if (latestProcessedBlockHeight < 0) {
      continue;
    }

    const latestChainDataList: ChainData[] = [];
    try {
      // Fetching new chain data via the funnel
      // note: this is done in a separate SQL transaction from actually applying the data
      latestChainDataList.push(
        ...(await tx<ChainData[]>(gameStateMachine.getReadWriteDbConn(), async dbTx => {
          const chainFunnel = await funnelFactory.generateFunnel(dbTx);
          return await getSyncRoundData(chainFunnel, pollingPeriod, latestProcessedBlockHeight);
        }))
      );
      if (latestChainDataList.length === 0) {
        continue;
      }
    } catch (err) {
      doLog('[paima-runtime] Funnel failure:');
      logError(err);
      // delete any cache entires as they may have been partially applied before the crash
      funnelFactory.clearCache();
      // delay before retrying to avoid getting rate limited by any remote call in a funnel
      if (err instanceof TimeoutError) {
        await delay(err.timeout);
      } else {
        await delay(2000);
      }

      continue;
    }

    // Iterate through all of the returned chainData and process each one via the state machine's STF
    try {
      for (const chainData of latestChainDataList) {
        let count = await processSyncBlockData(
          gameStateMachine,
          chainData,
          pollingPeriod,
          stopBlockHeight
        );
        if (count === -1) break;

        let emulated: number | undefined;
        let blockNumber: number = chainData.blockNumber;

        if (count) {
          if (ENV.EMULATED_BLOCKS) {
            const [e] = await emulatedSelectLatestPrior.run(
              {
                emulated_block_height: chainData.blockNumber,
              },
              gameStateMachine.getReadWriteDbConn()
            );
            emulated = blockNumber;
            blockNumber = e.deployment_chain_block_height;
          }

          // TODO: this is dangerous because this event is skipped if Paima shuts down before it gets emitted
          await PaimaEventManager.Instance.sendMessage(BuiltinEvents.RollupBlock, {
            block: blockNumber,
            emulated,
          });
        }
      }
    } catch (err) {
      doLog('[paima-runtime] Uncaught error propagated to runtime while processing chain data:');
      logError(err);
      // delete any cache entires as they may have been partially applied before the crash
      funnelFactory.clearCache();
      continue;
    }
  }
}

async function getSyncRoundStart(
  gameStateMachine: GameStateMachine,
  pollingPeriod: number,
  stopBlockHeight: number | null
): Promise<number> {
  try {
    const latestProcessedBlockHeight = await acquireLatestBlockHeight(
      gameStateMachine,
      pollingPeriod
    );
    await cleanNoncesIfTime(gameStateMachine.getReadWriteDbConn(), latestProcessedBlockHeight);
    await snapshotIfTime(latestProcessedBlockHeight);
    await loopIfStopBlockReached(latestProcessedBlockHeight, stopBlockHeight);
    exitIfStopped(run);
    return latestProcessedBlockHeight;
  } catch (err) {
    doLog('[paima-runtime] Error in pre-funnel phase:');
    logError(err);
    return -1;
  }
}

async function getSyncRoundData(
  chainFunnel: ChainFunnel,
  pollingPeriod: number,
  latestProcessedBlockHeight: number
): Promise<ChainData[]> {
  try {
    const latestChainDataList = await chainFunnel.readData(latestProcessedBlockHeight + 1);
    exitIfStopped(run);

    // If no new chain data, delay for the duration of the pollingPeriod
    if (!latestChainDataList || !latestChainDataList?.length) {
      await delay(pollingPeriod);
      return [];
    }

    return latestChainDataList;
  } catch (err) {
    doLog('[paima-runtime] Error received from the funnel:');
    logError(err);
    throw err;
  }
}

async function processSyncBlockData(
  gameStateMachine: GameStateMachine,
  chainData: ChainData,
  pollingPeriod: number,
  stopBlockHeight: number | null
): Promise<number> {
  // Checking if should safely close in between processing blocks
  exitIfStopped(run);

  // note: every state machine update is its own SQL transaction
  // this is to ensure things like shutting down and taking snapshots properly sees SM updates
  const count = await tx<number>(gameStateMachine.getReadWriteDbConn(), async dbTx => {
    // Before processing -- sanity check of block height:
    if (!(await blockPreProcess(dbTx, gameStateMachine, chainData.blockNumber, pollingPeriod))) {
      return -1;
    }

    // Processing proper -- data migrations and passing chain data to SM
    return await blockCoreProcess(dbTx, gameStateMachine, chainData);
  });
  if (count === -1) return -1;

  // After processing -- checking
  if (!(await blockPostProcess(gameStateMachine, chainData.blockNumber, stopBlockHeight))) {
    return -1;
  }

  return count;
}

async function blockPreProcess(
  dbTx: PoolClient,
  gameStateMachine: GameStateMachine,
  blockNumber: number,
  pollingPeriod: number
): Promise<boolean> {
  try {
    const latestReadBlockHeight = await acquireLatestBlockHeight(
      gameStateMachine,
      pollingPeriod,
      dbTx
    );
    if (blockNumber !== latestReadBlockHeight + 1) {
      doLog(`[paima-runtime] Block number ${blockNumber} encountered out of order!`);
      return false;
    }
  } catch (err) {
    doLog(`[paima-runtime] Error occurred prior to SM processing of block ${blockNumber}:`);
    logError(err);
    return false;
  }

  return true;
}

async function blockCoreProcess(
  dbTx: PoolClient,
  gameStateMachine: GameStateMachine,
  chainData: ChainData
): Promise<number> {
  let count = 0;
  try {
    if (DataMigrations.hasPendingMigrationForBlock(chainData.blockNumber)) {
      await DataMigrations.applyDataDBMigrations(dbTx, chainData.blockNumber);
    }
    count = await gameStateMachine.process(dbTx, chainData);
    exitIfStopped(run);
  } catch (err) {
    doLog(`[paima-runtime] Error occurred while SM processing of block ${chainData.blockNumber}:`);
    logError(err);
    return -1;
  }

  return count;
}

async function blockPostProcess(
  gameStateMachine: GameStateMachine,
  blockNumber: number,
  stopBlockHeight: number | null
): Promise<boolean> {
  try {
    const latestReadBlockHeight = await gameStateMachine.latestProcessedBlockHeight();
    await snapshotIfTime(latestReadBlockHeight);
    exitIfStopped(run);
    await loopIfStopBlockReached(latestReadBlockHeight, stopBlockHeight);
  } catch (err) {
    doLog(`[paima-runtime] Error occurred after SM processing of block ${blockNumber}:`);
    logError(err);
    return false;
  }

  return true;
}

const startMQTTBroker = async (): Promise<void> => {
  if (ENV.MQTT_BROKER) {
    new PaimaEventBroker('Paima-Engine').getServer();
  }
  return;
};
