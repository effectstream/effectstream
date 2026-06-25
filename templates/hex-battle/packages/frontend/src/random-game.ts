import {
  Game,
  UnitType,
  BuildingType,
  GameMap,
  Player,
  AIPlayer,
  CreateGame,
} from '@hex-battle/engine';

export class RandomGame extends Game {
  private static BuildDualRing(numberOftiles: number, glichChance: number) {
    for (let retries = 10; retries > 0; retries -= 1) {
      const map = GameMap.RingMap(numberOftiles);
      const mapB = GameMap.RingMap(numberOftiles);
      mapB.tiles.forEach(t => {
        t.q += map.maxQ;
        t.s -= map.maxQ;
        t.q += map.maxS;
        t.r -= map.maxS;
      });

      mapB.tiles.forEach(t => {
        if (!map.tiles.find(x => x.same(t))) {
          map.tiles.push(t);
        }
      });
      map.updateLimits();

      for (let i = map.tiles.length - 1; i >= 0; i -= 1) {
        if (Math.random() < glichChance) {
          map.tiles.splice(i, 1);
        }
      }

      const nodes = [{tile: map.tiles[0], isChecked: false}];

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const check = nodes.find(x => !x.isChecked);
        if (!check) break;

        check.isChecked = true;
        for (let dir = 0; dir < 6; dir++) {
          const tile = map.getTileFrom(check.tile, dir, 1);
          if (tile && !nodes.find(x => x.tile.same(tile))) {
            nodes.push({tile, isChecked: false});
          }
        }
      }
      if (nodes.length === map.tiles.length) {
        return map;
      }

      console.log(`Retrying [${retries}] map is not connected`);
    }

    throw new Error('Connected map was not built in 10 retries');
  }

  private static BuildPlayers(
    humanPlayers: number,
    AIPlayers: number,
    initalGold: number,
    localWallet: string
  ) {
    const players = [
      ...new Array(humanPlayers)
        .fill(0)
        .map(
          (_, i) => new Player(Player.PlayerIndexes[i], initalGold, localWallet)
        ),
      ...new Array(AIPlayers)
        .fill(0)
        .map(
          (_, i) =>
            new AIPlayer(Player.PlayerIndexes[humanPlayers + i], initalGold)
        ),
    ]
      .map(value => ({value, sort: Math.random()}))
      .sort((a, b) => a.sort - b.sort)
      .map(({value}) => value);
    return players;
  }

  constructor(
    lobbyId: string,
    localWallet: string,
    humanPlayers: number,
    AIPlayers: number,
    size: 'small' | 'medium' | 'large',
    initialUnitsTypes: UnitType[],
    initialBuildingsTypes: BuildingType[],
    initalNumberOfTitlesPerPlayer: number,
    initalGold = 10,
    glitch = 0.1
  ) {
    const players = RandomGame.BuildPlayers(
      humanPlayers,
      AIPlayers,
      initalGold,
      localWallet
    );

    const numberOfPlayers = humanPlayers + AIPlayers;
    const numberOftiles =
      numberOfPlayers * initalNumberOfTitlesPerPlayer +
      numberOfPlayers * (size === 'small' ? 5 : size === 'medium' ? 15 : 25);

    const map: GameMap = RandomGame.BuildDualRing(numberOftiles, glitch);

    CreateGame.AsignPlayersToMap(
      players,
      map,
      initalNumberOfTitlesPerPlayer,
      initialUnitsTypes,
      initialBuildingsTypes,
      {
        nextInt(min: number, max: number) {
          return Math.floor(Math.random() * (max - min + 1)) + min;
        },
      }
    );

    super(lobbyId, map, players, localWallet, 0);
  }
}
