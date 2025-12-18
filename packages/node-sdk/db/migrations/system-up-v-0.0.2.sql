-- Enforce uniqueness for migration history entries
CREATE UNIQUE INDEX IF NOT EXISTS effectstream_migration_history_unique_name_system
ON effectstream.effectstream_migration_history (name, is_system_migration);

-- Add idempotency support for primitive accounting entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'effectstream'
      AND table_name = 'primitive_accounting'
      AND column_name = 'payload_hash'
  ) THEN
    ALTER TABLE effectstream.primitive_accounting
      ADD COLUMN payload_hash TEXT GENERATED ALWAYS AS (md5(payload::text)) STORED;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS primitive_accounting_unique_payload_per_block
ON effectstream.primitive_accounting (primitive_name, effectstream_block_height, payload_hash);
