import { Controller, Get, Query, Route, ValidateError } from 'tsoa';
import { requirePool, getLobbyById, getRoundData, getRoundMoves } from '@game/db';
import { isLeft } from 'fp-ts/Either';
import { psqlNum } from '../validation.js';
import type { RoundExecutorData } from '@game/utils';
import { getBlockHeights } from '@paima/node-sdk/db';

type GetRoundExecutorResponse = RoundExecutorData | RoundExecutorError;

interface RoundExecutorError {
  error: 'lobby not found' | 'bad round number' | 'round not found';
}

@Route('round_executor')
export class RoundExecutorController extends Controller {
  @Get()
  public async get(
    @Query() lobbyID: string,
    @Query() round: number
  ): Promise<GetRoundExecutorResponse> {
    const pool = requirePool();
    const valRound = psqlNum.decode(round);
    if (isLeft(valRound))
      throw new ValidateError(
        {
          round: {
            message: 'invalid number',
          },
        },
        ''
      );
    else {
      const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, pool);
      if (!lobby) return { error: 'lobby not found' };
      else {
        if (!(round > 0)) return { error: 'bad round number' };
        else {
          const [round_data] = await getRoundData.run(
            { lobby_id: lobbyID, round_number: round },
            pool
          );
          if (!round_data) return { error: 'round not found' };
          else {
            const [block_height] = await getBlockHeights.run(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              { block_heights: [round_data.execution_block_height!] },
              pool
            );
            const moves = await getRoundMoves.run({ lobby_id: lobbyID, round: round }, pool);
            return { lobby, moves, block_height };
          }
        }
      }
    }
  }
}
