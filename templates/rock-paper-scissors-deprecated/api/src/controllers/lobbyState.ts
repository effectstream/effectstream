import { Controller, Get, Query, Route } from 'tsoa';
import { getLobbyById, getRoundData, requirePool } from '@game/db';
import type { LobbyStateQuery } from '@game/utils';

interface GetLobbyStateResponse {
  lobby: LobbyStateQuery | null;
}

@Route('lobby_state')
export class LobbyStatecontroller extends Controller {
  @Get()
  public async get(@Query() lobbyID: string): Promise<GetLobbyStateResponse> {
    const pool = requirePool();
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, pool);
    if (!lobby) return { lobby: null };
    else {
      const [round_data] = await getRoundData.run(
        { lobby_id: lobbyID, round_number: lobby.current_round },
        pool
      );
      return {
        lobby: {
          ...lobby,
          round_start_height: round_data?.starting_block_height || 0,
        },
      };
    }
  }
}
