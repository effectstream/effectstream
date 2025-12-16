import { Controller, Get, Query, Route, ValidateError } from 'tsoa';
import { requirePool, getLobbyById, getRoundData, getRoundMoves } from '@game/db';
import { isLeft } from 'fp-ts/Either';
import { psqlNum } from '../validation.js';
import type { RoundStatusData } from '@game/utils';

type GetRoundStatusResponse = RoundStatusData | RoundStatusError;

interface RoundStatusError {
  error: 'round not found' | 'lobby not found';
}

@Route('round_status')
export class RoundStatusController extends Controller {
  @Get()
  public async get(@Query() lobbyID: string, @Query() round: number): Promise<GetRoundStatusResponse> {
    const pool = requirePool();
    const valRound = psqlNum.decode(round);
    if (isLeft(valRound)) {
      throw new ValidateError({ round: { message: 'invalid number' } }, '');
    } else {
      const [roundData] = await getRoundData.run({ lobby_id: lobbyID, round_number: round }, pool);
      const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, pool);
      if (!lobby || !roundData) return { error: 'lobby not found' };
      else {
        const moves = await getRoundMoves.run({ lobby_id: lobbyID, round: round }, pool);
        const ids = moves.map(m => m.wallet);
        return {
          executed: !!roundData.execution_block_height,
          usersWhoSubmittedMoves: Array.from(new Set(ids)),
          roundStarted: roundData.starting_block_height,
          roundLength: lobby.round_length,
        };
      }
    }
  }
}
