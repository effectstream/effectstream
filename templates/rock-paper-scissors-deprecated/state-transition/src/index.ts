import { ENV } from '@paima/sdk/utils';
import gameStateTransitionV1 from './stf/v1';

// This function allows you to route between different State Transition Functions
// based on block height. In other words when a new update is pushed for your game
// that includes new logic, this router allows your game node to cleanly maintain
// backwards compatibility with the old history before the new update came into effect.
function gameStateTransitionRouter(blockHeight: number) {
  if (ENV.START_BLOCKHEIGHT <= blockHeight /** &&  ENV.START_BLOCKHEIGHT + X > blockHeight*/) {
    return gameStateTransitionV1;
  }
  // if (ENV.START_BLOCKHEIGHT + X <= blockHeight) return gameStateTransitionV2;
  else return gameStateTransitionV1;
}

export default gameStateTransitionRouter;
