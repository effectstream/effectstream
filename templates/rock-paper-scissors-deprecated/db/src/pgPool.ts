import type pg from 'pg';
import { getConnection } from '@paima/node-sdk/db';

/**
 * Pool of Postgres connections to avoid overhead of connecting on every request.
 */

export const creds = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PW,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432', 10),
};

let pool: pg.Pool | null = null;

export function requirePool(): pg.Pool {
  if (pool == null) {
    pool = getConnection(creds, false);
  }
  return pool as pg.Pool;
}
