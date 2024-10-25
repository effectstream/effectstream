import { doLog } from '@paima/utils';
import type {
  IGetDelegationsFromWithAddressResult,
  IGetDelegationsToWithAddressResult,
} from './sql/wallet-delegation.queries.js';
import {
  getAddressFromAddress,
  getDelegationsFromWithAddress,
  getDelegationsToWithAddress,
  getMainAddressFromAddress,
} from './sql/wallet-delegation.queries.js';
import type { Notification, Client } from 'pg';
import type { IDatabaseConnection } from '@pgtyped/runtime/lib/tag';

export type WalletDelegate = { address: string; id: number };
export const NO_USER_ID = -1;

/**
 *  TODO
 *  This is a temporal fix as lru-cache module was
 *  not correctly packaged into a single file.
 */
let useAddressCache = false;
export const addressCache = new Map<string, WalletDelegate>();

// Get Main Wallet and ID for address.
// If wallet does not exist, It will NOT be created in address table.
export async function getMainAddress(
  _address: string,
  DBConn: IDatabaseConnection
): Promise<WalletDelegate> {
  const address = _address.toLowerCase();
  let addressMapping: WalletDelegate | undefined = addressCache.get(address);
  if (useAddressCache && addressMapping) return addressMapping;

  // get main address.
  const [addressResult] = await getMainAddressFromAddress.run({ address }, DBConn);

  if (!addressResult) {
    // This wallet has never been used before.
    // This value will get updated before sent to the STF.
    return { address, id: NO_USER_ID };
  }

  const result = addressResult.from_address
    ? // this wallet is a delegate.
      { address: addressResult.from_address, id: addressResult.from_id }
    : // this is the main wallet or does not have delegations.
      { address: addressResult.to_address, id: addressResult.to_id };

  addressCache.set(address, result);

  return result;
}

export async function getRelatedWallets(
  _address: string,
  DBConn: IDatabaseConnection
): Promise<{
  from: IGetDelegationsFromWithAddressResult[];
  to: IGetDelegationsToWithAddressResult[];
  id: number;
}> {
  const address = _address.toLowerCase();
  const [addressResult] = await getAddressFromAddress.run({ address }, DBConn);
  if (!addressResult) {
    return { from: [], to: [], id: NO_USER_ID };
  }
  let to: IGetDelegationsToWithAddressResult[] = [];
  let from: IGetDelegationsFromWithAddressResult[] = [];

  to = await getDelegationsToWithAddress.run({ to_id: addressResult.id }, DBConn);
  if (!to.length) {
    // cannot be both from and to.
    from = await getDelegationsFromWithAddress.run({ from_id: addressResult.id }, DBConn);
  }

  return {
    from,
    to,
    id: to.length ? to[0].id : addressResult.id,
  };
}

// This should only be used by paima-engine funnel.
export function enableManualCache(): void {
  useAddressCache = true;
}

// This improves performance by caching the results of the queries.
// It is not enabled by default because `clearDelegateWalletCacheOnChanges` must be called from client.
export async function clearDelegateWalletCacheOnChanges(DBConn: Client): Promise<void> {
  if (useAddressCache) throw new Error('Already listening to wallet connect updates');
  doLog('Listening to wallet connect updates');
  await DBConn.query('LISTEN wallet_connect_change');
  DBConn.on('notification', (_: Notification) => {
    // { ...
    //   payload: '{
    //     "timestamp":"2023-12-18 14:26:57.186068-03",
    //     "operation":"DELETE", /* INSERT | UPDATE | DELETE */
    //     "schema":"public",
    //     "table":"addresses", /* addresses | delegations */
    //     "data":{"id":"16","address":"23"} /* addresses or delegations table fields */
    //   }',
    // }
    addressCache.clear();
  });
  DBConn.on('end', () => {
    doLog('Stopped listening to wallet connect updates?!');
  });
  useAddressCache = true;
}
