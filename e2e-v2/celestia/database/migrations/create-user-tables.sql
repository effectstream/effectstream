CREATE TABLE IF NOT EXISTS celestia_blobs (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  content TEXT NOT NULL
);
