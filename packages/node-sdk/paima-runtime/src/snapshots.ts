import * as fs from 'fs/promises';

import { execFile } from 'child_process';
import type { ExecFileException } from 'child_process';
import { doLog, logError } from '@paima/utils';

const SNAPSHOT_INTERVAL = 21600;
const RETRY_SNAPSHOT_INTERVAL = 3600;
const MAX_SNAPSHOT_COUNT = 3;
const SNAPSHOT_DIR = './snapshots';

let snapshotTrigger: number = 0;
let snapshotNames: string[] = [];

const snapshotPath = (fileName: string): string => `${SNAPSHOT_DIR}/${fileName}`;

async function getLatestSnapshotBlockheight(): Promise<number> {
  try {
    const newest = await getNewestFilename(SNAPSHOT_DIR);
    const maxnum = newest.match(/\d+/);
    const max = maxnum?.[0] || '0';
    return parseInt(max);
  } catch (err) {
    doLog(`[paima-runtime::snapshots] Creating snapshot folder as none found.`);
    await fs.mkdir(SNAPSHOT_DIR);
    return 0;
  }
}

async function getNewestFilename(dir: string): Promise<string> {
  const files = await fs.readdir(dir);
  if (files.length === 0) {
    return '';
  }
  const statPromises = files.map(async fileName => {
    const s = await fs.stat(dir + '/' + fileName);
    return { name: fileName, stats: s };
  });
  const stats = await Promise.all(statPromises);
  stats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
  return stats[stats.length - 1].name;
}

async function saveSnapshot(blockHeight: number): Promise<void> {
  const fileName = `paima-snapshot-${blockHeight}.sql`;
  doLog(`[paima-runtime::snapshots] Saving Snapshot: ${fileName}`);
  const url = Object.assign(new URL('postgresql://'), {
    hostname: process.env.DB_HOST,
    port: process.env.DB_PORT || '5432',
    username: process.env.DB_USER,
    password: process.env.DB_PW,
    pathname: process.env.DB_NAME,
  } satisfies Partial<URL>).toString();
  execFile(
    'pg_dump',
    [`--dbname=${url}`, '-f', snapshotPath(fileName)],
    (error: ExecFileException | null, stdout: string, stderr: string) => {
      if (error) {
        doLog(`[paima-runtime::snapshots] Error saving snapshot: ${stderr}`);
      }
    }
  );
  snapshotNames.push(fileName);
}

async function cleanSnapshots(): Promise<void> {
  while (snapshotNames.length > MAX_SNAPSHOT_COUNT) {
    const snapshotToDelete = snapshotNames.shift();
    if (typeof snapshotToDelete === 'undefined') {
      continue; // should never happen
    }
    try {
      doLog(`[paima-runtime::snapshots] removing snapshot ${snapshotToDelete}...`);
      await fs.rm(`${snapshotPath(snapshotToDelete)}`);
    } catch (err) {
      doLog(`[paima-runtime::snapshots] error while removing ${snapshotToDelete}:`);
      logError(err);
    }
  }
}

export async function snapshotIfTime(latestReadBlockHeight: number): Promise<void> {
  if (latestReadBlockHeight >= snapshotTrigger) {
    try {
      snapshotTrigger = latestReadBlockHeight + SNAPSHOT_INTERVAL;
      await saveSnapshot(latestReadBlockHeight);
    } catch (err) {
      doLog(
        `[paima-runtime::snapshots] error while saving snapshot at height ${latestReadBlockHeight}:`
      );
      logError(err);
      snapshotTrigger = latestReadBlockHeight + RETRY_SNAPSHOT_INTERVAL;
    }
    try {
      await cleanSnapshots();
    } catch (err) {
      doLog(`[paima-runtime::snapshots] error while attempting to clean snapshots`);
    }
    doLog(`[paima-runtime::snapshots] Next snapshot scheduled at height ${snapshotTrigger}`);
  }
}

export async function initSnapshots(): Promise<void> {
  try {
    const latestSnapshot = await getLatestSnapshotBlockheight();
    snapshotTrigger = latestSnapshot + SNAPSHOT_INTERVAL;
  } catch (err) {
    doLog(`[paima-runtime::snapshots] Error while retrieving latest snapshot blockheight:`);
    logError(err);
    snapshotTrigger = 0;
  }
}
