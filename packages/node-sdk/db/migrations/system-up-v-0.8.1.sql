CREATE TABLE effectstream.sync_protocol_config_snapshot (
  protocol_name TEXT PRIMARY KEY,
  network_type TEXT NOT NULL,
  immutable_config JSONB NOT NULL
);
