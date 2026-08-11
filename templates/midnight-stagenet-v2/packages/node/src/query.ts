import type { SqlClient } from "./state-machine.ts";

export interface StoredSinkEvent {
  eventIdentity: string;
  eventId: number;
  indexerTransactionId: string;
  transactionHash: string;
  blockHash: string;
  blockHeight: string;
  emitterContractAddress: string;
  eventType: string;
  digest: string;
}

export async function getSinkEvent(
  db: SqlClient,
  eventIdentity: string,
): Promise<StoredSinkEvent | undefined> {
  const result = await db.query<{
    event_identity: string;
    event_id: number;
    indexer_transaction_id: string;
    transaction_hash: string;
    block_hash: string;
    block_height: string;
    emitter_contract_address: string;
    event_type: string;
    digest: string;
  }>(
    `SELECT event_identity, event_id, indexer_transaction_id::text,
            transaction_hash, block_hash, block_height::text,
            emitter_contract_address, event_type, digest
       FROM midnight_v2_template.contract_events
      WHERE event_identity = $1`,
    [eventIdentity],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    eventIdentity: row.event_identity,
    eventId: row.event_id,
    indexerTransactionId: row.indexer_transaction_id,
    transactionHash: row.transaction_hash,
    blockHash: row.block_hash,
    blockHeight: row.block_height,
    emitterContractAddress: row.emitter_contract_address,
    eventType: row.event_type,
    digest: row.digest,
  };
}

export async function getSinkEventSummary(
  db: SqlClient,
): Promise<{ processedCount: number; latestBlockHeight?: string }> {
  const result = await db.query<{ processed_count: number; latest_block_height: string | null }>(
    `SELECT COUNT(*)::integer AS processed_count,
            MAX(block_height)::text AS latest_block_height
       FROM midnight_v2_template.contract_events`,
  );
  const row = result.rows[0];
  return {
    processedCount: row?.processed_count ?? 0,
    latestBlockHeight: row?.latest_block_height ?? undefined,
  };
}
