/* @name upsertCounterState */
INSERT INTO counter_state (authority, value, slot, block_height, updated_at)
VALUES (:authority!, :value!, :slot!, :block_height!, NOW())
ON CONFLICT (authority) DO UPDATE
  SET value = EXCLUDED.value,
      slot = EXCLUDED.slot,
      block_height = EXCLUDED.block_height,
      updated_at = NOW()
RETURNING authority, value, slot, block_height;

/* @name insertCounterEvent */
INSERT INTO counter_events (authority, value, slot, block_height, kind, delta)
VALUES (:authority!, :value!, :slot!, :block_height!, :kind!, :delta!);

/* @name getCounterByAuthority */
SELECT authority, value, slot, block_height, updated_at
FROM counter_state
WHERE authority = :authority!;

/* @name getAllCounters */
SELECT authority, value, slot, block_height, updated_at
FROM counter_state
ORDER BY value DESC;

/* @name getRecentEvents */
SELECT id, authority, value, slot, block_height, kind, delta, emitted_at
FROM counter_events
ORDER BY id DESC
LIMIT :limit;
