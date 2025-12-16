import { Controller, Get, Route } from 'tsoa';
import type { IGetRandomActiveLobbyResult } from '@game/db';
import { requirePool, getRandomActiveLobby } from '@game/db';

interface RandomActiveLobbyResponse {
  lobby: IGetRandomActiveLobbyResult | null;
}

@Route('random_active_lobby')
export class RandomActiveLobbyController extends Controller {
  @Get()
  public async get(): Promise<RandomActiveLobbyResponse> {
    const pool = requirePool();
    const [lobby] = await getRandomActiveLobby.run(undefined, pool);
    const result = lobby || null;
    return { lobby: result };
  }
}
