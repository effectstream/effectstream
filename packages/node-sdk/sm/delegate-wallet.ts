import type {
  IGetDelegationsFromWithAddressResult,
  IGetDelegationsToWithAddressResult,
} from "@paima/db";
import {
  getAddressFromAddress,
  getDelegationsFromWithAddress,
  getDelegationsToWithAddress,
  getMainAddressFromAddress,
} from "@paima/db";
import type { Pool, PoolClient } from "pg";
import {
  execUpdateStateStream,
  type StateUpdateStream,
  World,
} from "@paima/coroutine";

export type WalletDelegate = { address: string; id: number };
export const NO_USER_ID = -1;

export const addressCache = new Map<string, WalletDelegate>();

export async function getMainAddress(
  _address: string,
  DBConn: Pool | PoolClient,
): Promise<WalletDelegate> {
  return await execUpdateStateStream(mainAddressGenerator(_address), DBConn);
}

/**
 * Get Main Wallet and ID for address.
 * If wallet does not exist, It will NOT be created in address table.
 */
export function* mainAddressGenerator(
  _address: string,
): StateUpdateStream<WalletDelegate> {
  const address = _address.toLocaleLowerCase();
  const addressMapping: WalletDelegate | undefined = addressCache.get(address);
  if (addressMapping) return addressMapping;

  // get main address.
  const [addressResult] = yield* World.resolve(getMainAddressFromAddress, {
    address,
  });

  if (!addressResult) {
    // This wallet has never been used before.
    // This value will get updated before sent to the STF.
    return { address, id: NO_USER_ID };
  }

  const result = addressResult.from_address
    // this wallet is a delegate.
    ? { address: addressResult.from_address, id: addressResult.from_id }
    // this is the main wallet or does not have delegations.
    : { address: addressResult.to_address, id: addressResult.to_id };

  addressCache.set(address, result);

  return result;
}

export async function getRelatedWallets(
  _address: string,
  DBConn: PoolClient,
): Promise<{
  from: IGetDelegationsFromWithAddressResult[];
  to: IGetDelegationsToWithAddressResult[];
  id: number;
}> {
  const address = _address.toLocaleLowerCase();
  const [addressResult] = await getAddressFromAddress.run({ address }, DBConn);
  if (!addressResult) {
    return { from: [], to: [], id: NO_USER_ID };
  }
  let to: IGetDelegationsToWithAddressResult[] = [];
  let from: IGetDelegationsFromWithAddressResult[] = [];

  to = await getDelegationsToWithAddress.run(
    { to_id: addressResult.id },
    DBConn,
  );
  if (!to.length) {
    // cannot be both from and to.
    from = await getDelegationsFromWithAddress.run({
      from_id: addressResult.id,
    }, DBConn);
  }

  return {
    from,
    to,
    id: to.length ? to[0].id : addressResult.id,
  };
}
