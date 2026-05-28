import type { Prando } from "@effectstream/crypto";
import type { WalletAddress } from "@effectstream/utils";
import {
  createGlobalUserState,
  updateUserGlobalPosition,
  updateWorldStateCounter,
} from "@world-map-2d/db";

type SQLUpdate = [any, any];

export interface JoinWorldInput {
  input: "joinWorld";
}

export interface SubmitMoveInput {
  input: "submitMove";
  x: number;
  y: number;
}

export interface SubmitIncrementInput {
  input: "submitIncrement";
  x: number;
  y: number;
}

// State transition when a user joins the world
export const joinWorld = async (
  player: WalletAddress,
  blockHeight: number,
  input: JoinWorldInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate> => {
  return persistNewUser(player);
};

// State transition when a user submits a move
export const submitMove = async (
  player: WalletAddress,
  blockHeight: number,
  input: SubmitMoveInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate> => {
  return persistUserPosition(player, input.x, input.y);
};

// State transition when a user submits an increment
export const submitIncrement = async (
  player: WalletAddress,
  blockHeight: number,
  input: SubmitIncrementInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate> => {
  return persistWorldCount(input.x, input.y);
};

function persistWorldCount(x: number, y: number): SQLUpdate {
  const params = { x, y };
  return [updateWorldStateCounter, params];
}

function persistNewUser(wallet: WalletAddress): SQLUpdate {
  const params = { wallet, x: 0, y: 0 };
  return [createGlobalUserState, params];
}

function persistUserPosition(
  wallet: WalletAddress,
  x: number,
  y: number
): SQLUpdate {
  const params = { x, y, wallet };
  return [updateUserGlobalPosition, params];
}
