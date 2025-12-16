import { Body, Controller, Get, Path, Post, Query, Route, SuccessResponse } from 'tsoa';
import { requirePool, getUserStats } from '@game/db';
import type { UserStats } from '@game/utils';

interface GetUserStatsResponse {
  stats: UserStats;
}

@Route('user_stats')
export class UserStatsController extends Controller {
  @Get()
  public async get(@Query() wallet: string): Promise<GetUserStatsResponse> {
    const pool = requirePool();
    wallet = wallet.toLowerCase();
    const [stats] = await getUserStats.run({ wallet }, pool);
    return { stats };
  }
}
