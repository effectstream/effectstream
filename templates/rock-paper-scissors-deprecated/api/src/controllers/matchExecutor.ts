import { Controller, Get, Query, Route } from 'tsoa';
import { requirePool, getLobbyById, getMatchSeeds, getMovesByLobby } from '@game/db';
import type { MatchExecutorData } from '@game/utils';

type GetMatchExecutorResponse = MatchExecutorData | null;

@Route('match_executor')
export class MatchExecutorController extends Controller {
  @Get()
  public async get(@Query() lobbyID: string): Promise<GetMatchExecutorResponse> {
    const pool = requirePool();
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, pool);
    if (!lobby) return null;
    else {
      const rounds = await getMatchSeeds.run({ lobby_id: lobbyID }, pool);
      const seeds = rounds.map(r => {
        return {
          seed: r.seed,
          block_height: r.block_height,
          round: r.round_within_match,
        };
      });
      const moves = await getMovesByLobby.run({ lobby_id: lobbyID }, pool);
      return { lobby, seeds, moves };
    }
  }
}
