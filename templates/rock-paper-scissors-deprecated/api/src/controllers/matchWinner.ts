import { Controller, Get, Query, Route } from 'tsoa';
import type { IGetFinalStateResult } from '@game/db';
import { requirePool, getLobbyById, getFinalState } from '@game/db';
import type { MatchWinnerResponse } from '@game/utils';

const getWinner = (finalState: IGetFinalStateResult): string => {
  switch (finalState.player_one_result) {
    case 'win':
      return finalState.player_one_wallet;
    case 'loss':
      return finalState.player_two_wallet;
    default:
      return '';
  }
};

@Route('match_winner')
export class MatchWinnerController extends Controller {
  @Get()
  public async get(@Query() lobbyID: string): Promise<MatchWinnerResponse> {
    const pool = requirePool();
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, pool);
    if (!lobby) return {};

    if (lobby.lobby_state !== 'finished') {
      return {
        match_status: lobby.lobby_state,
      };
    }

    const [finalState] = await getFinalState.run({ lobby_id: lobbyID }, pool);
    if (!finalState) {
      return {
        match_status: lobby.lobby_state,
      };
    }

    return {
      match_status: 'finished',
      winner_address: getWinner(finalState),
    };
  }
}
