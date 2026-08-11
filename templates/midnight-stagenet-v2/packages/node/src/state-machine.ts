export interface ContractEventPrimitivePayload {
  eventIdentity: string;
  eventId: number;
  eventVersion: number;
  protocolVersion: number;
  contractAddress: string;
  indexerTransactionId: number;
  transactionHash: string;
  blockHash: string;
  blockHeight: number;
  eventType: string;
  raw: string;
}

export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface SinkEventTransitionConfig {
  contractAddress: string;
  eventType: "Unpaused";
}

export async function applySinkContractEvent(
  db: SqlClient,
  event: ContractEventPrimitivePayload,
  observedDigest: string,
  config: SinkEventTransitionConfig,
): Promise<{ applied: boolean; processedCount: number }> {
  const expectedEmitter = normalizeHex(config.contractAddress);
  if (normalizeHex(event.contractAddress) !== expectedEmitter || event.eventType !== config.eventType) {
    return { applied: false, processedCount: await countEvents(db) };
  }
  const digest = normalizeHex(observedDigest);
  // `Unpaused` is a zero-payload standard event. The caller must supply the
  // digest read from the sink ledger at this event's finalized block; C16 owns
  // that block-pinned join and this transition owns its durable idempotency.
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("The observed sink digest must be 32-byte hex");
  }
  const inserted = await db.query<{ event_identity: string }>(
    `INSERT INTO midnight_v2_template.contract_events (
       event_identity, event_id, event_version, protocol_version,
       indexer_transaction_id, transaction_hash, block_hash, block_height,
       emitter_contract_address, event_type, digest, raw
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (event_identity) DO NOTHING
     RETURNING event_identity`,
    [
      event.eventIdentity,
      event.eventId,
      event.eventVersion,
      event.protocolVersion,
      event.indexerTransactionId,
      normalizeHex(event.transactionHash),
      normalizeHex(event.blockHash),
      event.blockHeight,
      expectedEmitter,
      event.eventType,
      digest,
      event.raw,
    ],
  );
  return {
    applied: inserted.rows.length === 1,
    processedCount: await countEvents(db),
  };
}

async function countEvents(db: SqlClient): Promise<number> {
  const result = await db.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM midnight_v2_template.contract_events",
  );
  return result.rows[0]?.count ?? 0;
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/, "").toLowerCase();
}
