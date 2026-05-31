import {BuildingType, Building} from './building';
import {Game} from './game';
import {QRSCoord} from './hex';
import {GameMap} from './map';
import {Player} from './player';
import {Tile} from './tile';
import {UnitType, Unit} from './unit';

interface RandomGenerator {
  nextInt(min: number, max: number): number;
}

export class CreateGame {
  public static newGame(
    lobbyId: string,
    localWallet: string,
    map: GameMap,
    _players: Player[],
    initialUnitsTypes: UnitType[],
    initialBuildingsTypes: BuildingType[],
    initalNumberOfTitlesPerPlayer: number,
    initialBlockHeight: number,
    rand: RandomGenerator
  ) {
    // Player Order
    const players = _players
      .map(value => ({value, sort: rand.nextInt(0, 10000)}))
      .sort((a, b) => a.sort - b.sort)
      .map(({value}) => value);

    CreateGame.AsignPlayersToMap(
      players,
      map,
      initalNumberOfTitlesPerPlayer,
      initialUnitsTypes,
      initialBuildingsTypes,
      rand
    );

    return new Game(lobbyId, map, players, localWallet, initialBlockHeight);
  }

  private static QRSDistance = (tileA: Tile, tileB: Tile) => {
    const a = tileA.getCoordinates();
    const b = tileB.getCoordinates();
    const vec: QRSCoord = {q: a.q - b.q, r: a.r - b.r, s: a.s - b.s};
    return Math.max(Math.abs(vec.q), Math.abs(vec.r), Math.abs(vec.s));
  };

  private static CheckIfNearOpponent = (
    occupied: Tile[],
    player: Player,
    newTile: Tile | undefined,
    distance = 3
  ): boolean => {
    if (!newTile) return false;
    return occupied
      .filter(t => t.owner && t.owner.id !== player.id)
      .some(t => {
        if (CreateGame.QRSDistance(t, newTile) < distance) return true;
        return false;
      });
  };

  // TEMPLATE FOLD-IN DEVIATION (faithful simplification): the original engine
  // hard-coded the initial-position opponent-spacing distance to 6 and left the
  // building/unit placement loops unbounded. On the original game's large
  // procedural maps that was fine, but on the small demo maps a template ships
  // (e.g. a 7-tile board) those constraints are unsatisfiable and the unbounded
  // loops spin forever. We make the spacing adaptive to the map's actual radius
  // and bound every placement loop (falling back to any free owned tile, and
  // skipping a placement entirely if the board is too small). Gameplay (random
  // initial positions, then units/buildings placed on owned tiles) is preserved;
  // only the never-terminating edge case on small maps changes.
  private static mapRadius(map: GameMap): number {
    return Math.max(
      map.maxQ - map.minQ,
      map.maxR - map.minR,
      map.maxS - map.minS,
    );
  }

  private static AssignInitialPositions(
    map: GameMap,
    players: Player[],
    initalNumberOfTitlesPerPlayer: number,
    rand: RandomGenerator
  ) {
    let allOccupied: Tile[] = [];
    let globalRetries = 100;

    // Spacing scales with the board so small demo maps remain solvable.
    const radius = CreateGame.mapRadius(map);
    const startSpacing = Math.max(1, Math.min(6, Math.floor(radius / 2)));

    const resetMap = () => {
      globalRetries -= 1;
      if (globalRetries < 0) throw new Error('Too many retries');

      allOccupied.forEach(t => {
        t.owner = null;
      });
      allOccupied = [];
    };

    const attemptToAssign = () => {
      let internalRetries = 10000;
      const playerTiles = [];

      for (const player of players) {
        let initialTile: Tile | undefined;
        while (!initialTile || initialTile.owner) {
          internalRetries -= 1;
          if (internalRetries < 0) return false;

          initialTile = map.tiles[rand.nextInt(0, map.tiles.length - 1)];
          if (
            CreateGame.CheckIfNearOpponent(
              allOccupied,
              player,
              initialTile,
              startSpacing
            )
          )
            initialTile = undefined;
        }
        initialTile.owner = player;
        playerTiles.push(initialTile);
        allOccupied.push(initialTile);
      }

      for (const player of players) {
        for (let i = 0; i < initalNumberOfTitlesPerPlayer; i++) {
          let tile: Tile | undefined;
          while (!tile || tile.owner) {
            internalRetries -= 1;
            if (internalRetries < 0) return false;

            tile = map.getTileFrom(
              playerTiles[rand.nextInt(0, playerTiles.length - 1)],
              rand.nextInt(0, 5)
            );
            if (CreateGame.CheckIfNearOpponent(allOccupied, player, tile))
              tile = undefined;
          }
          tile.owner = player;
          playerTiles.push(tile);
          allOccupied.push(tile);
        }
      }

      return true;
    };

    while (globalRetries) {
      if (attemptToAssign()) break; // success
      resetMap();
    }

    return allOccupied;
  }

  // Pick a free owned tile for a building/unit. Tries randomly (respecting the
  // opponent-spacing rule) for a bounded number of attempts, then falls back to
  // ANY free owned tile, then gives up (returns undefined) if the board is full.
  private static pickFreeTile(
    playerTiles: Tile[],
    allOccupied: Tile[],
    player: Player,
    rand: RandomGenerator
  ): Tile | undefined {
    let attempts = playerTiles.length * 8 + 16;
    while (attempts-- > 0) {
      const tile = playerTiles[rand.nextInt(0, playerTiles.length - 1)];
      if (tile && !tile.building && !tile.unit) {
        if (!CreateGame.CheckIfNearOpponent(allOccupied, player, tile)) {
          return tile;
        }
      }
    }
    // Fallback: any free owned tile regardless of opponent proximity.
    return playerTiles.find(t => !t.building && !t.unit);
  }

  public static AsignPlayersToMap(
    players: Player[],
    map: GameMap,
    initalNumberOfTitlesPerPlayer: number,
    initialUnitsTypes: UnitType[],
    initialBuildingsTypes: BuildingType[],
    rand: RandomGenerator
  ) {
    const allOccupied: Tile[] = CreateGame.AssignInitialPositions(
      map,
      players,
      initalNumberOfTitlesPerPlayer,
      rand
    );

    for (const player of players) {
      const playerTiles = allOccupied.filter(
        t => t.owner && t.owner.id === player.id
      );

      for (const type of initialBuildingsTypes) {
        const tile = CreateGame.pickFreeTile(
          playerTiles,
          allOccupied,
          player,
          rand
        );
        if (!tile) break; // board too small — skip remaining buildings
        tile.building = new Building(player, type);
        allOccupied.push(tile);
      }

      for (const type of initialUnitsTypes) {
        const tile = CreateGame.pickFreeTile(
          playerTiles,
          allOccupied,
          player,
          rand
        );
        if (!tile) break; // board too small — skip remaining units
        const u = new Unit(
          player,
          type,
          Unit.generateUnitId(-1, tile.getCoordinates())
        );
        u.canMove = true;
        tile.unit = u;
        allOccupied.push(tile);
      }
    }
  }
}
