import {Building, BuildingType} from './building';
import {Game} from './game';
import {QRSCoord} from './hex';
import {GameMap} from './map';
import {Player, PlayerID} from './player';
import {Tile} from './tile';
import {Unit, UnitType} from './unit';

type HexMove =
  | {
      type: 'build';
      building: BuildingType;
      place: {q: number; r: number; s: number};
    }
  | {
      type: 'moveUnit';
      unit: {q: number; r: number; s: number};
      place: {q: number; r: number; s: number};
    }
  | {
      type: 'placeUnit';
      unit: UnitType;
      place: {q: number; r: number; s: number};
    };

type MapQualityItem = {
  isNeutral: boolean;
  isMine: boolean;
  isEnemy: boolean;
  isEnemyUnit: boolean;
  isEnemyBuilding: boolean;
  isEnemyEmpty: boolean;
  nextMyBase: boolean;
  nextEnemyBuilding: boolean;
  nextEnemyUnit: boolean;
  nextEnemyEmpty: boolean;
};
type MapQuality = Map<string, MapQualityItem>;

export class AIPlayer extends Player {
  constructor(playerId: PlayerID, gold: number) {
    super(playerId, gold, `AI-${(Math.random() * 10000) | 0}`);
    this.isHuman = false;
  }

  minMaxMove(game: Game) {
    const startTime = new Date().getTime();

    if (game.getCurrentPlayerId() !== this.id) {
      throw new Error("It's not my turn!");
    }
    // eslint-disable-next-line no-constant-condition
    let exported = '';
    // eslint-disable-next-line no-constant-condition
    while (1) {
      const moves = this.getAllMoves(game);
      if (!moves.length) break;
      exported = Game.export(game);
      const bestMove = moves.reduce(
        (best, move) => {
          const gameCopy = Game.import(exported);
          const playerCopy = gameCopy.getCurrentPlayer() as AIPlayer;
          if (move.type === 'build') {
            gameCopy.placeBuilding(
              playerCopy,
              gameCopy.map.tiles.find(t => t.same(move.place))!,
              move.building
            );
          }
          if (move.type === 'moveUnit') {
            gameCopy.moveUnit(
              playerCopy,
              gameCopy.map.tiles.find(t => t.same(move.unit))!,
              gameCopy.map.tiles.find(t => t.same(move.place))!
            );
          }
          if (move.type === 'placeUnit') {
            gameCopy.placeUnit(
              playerCopy,
              gameCopy.map.tiles.find(t => t.same(move.place))!,
              move.unit
            );
          }
          const score = playerCopy.minMaxScore(gameCopy);
          if (score > best.score) {
            return {move, score};
          }
          return best;
        },
        {move: moves[0], score: -Infinity}
      );
      const selectedMove = bestMove.move;
      if (selectedMove.type === 'build') {
        game.placeBuilding(
          this,
          game.map.tiles.find(t => t.same(bestMove.move.place))!,
          (bestMove.move as any).building
        );
      } else if (selectedMove.type === 'moveUnit') {
        game.moveUnit(
          this,
          game.map.tiles.find(t => t.same((bestMove.move as any).unit))!,
          game.map.tiles.find(t => t.same(bestMove.move.place))!
        );
      } else if (selectedMove.type === 'placeUnit') {
        game.placeUnit(
          this,
          game.map.tiles.find(t => t.same(bestMove.move.place))!,
          (bestMove.move as any).unit
        );
      }
    }

    const endTime = new Date().getTime();
    console.log('AI TIME', endTime - startTime, 'ms');

    game.endTurn();
  }

  private playerScore(game: Game, player: Player): number {
    const playerTiles = game.getMyTiles(player);
    let scoreUnits = 0;
    let scoreTowers = 0;
    let farmCount = 0;
    const scoreGoldPerTurn = player.goldPerRound(game.map);

    playerTiles.forEach(tile => {
      if (tile.unit) {
        scoreUnits += Unit.getPowerLevel(tile.unit.type) * 4;
      } else if (tile.building && tile.building.type === BuildingType.FARM) {
        farmCount += 1;
      } else if (tile.building && tile.building.type === BuildingType.TOWER) {
        scoreTowers += 3;
      } else if (tile.building && tile.building.type === BuildingType.TOWER2) {
        scoreTowers += 4;
      }
    });

    const score = scoreUnits + scoreTowers + scoreGoldPerTurn;

    return score;
  }

  private minMaxScore(game: Game): number {
    let globalScore = 0;
    const currentPlayer = game.getCurrentPlayer();
    for (let i = 0; i < game.players.length; i += 1) {
      if (game.players[i].id === currentPlayer.id) {
        if (game.players[i].alive) {
          globalScore += this.playerScore(game, game.players[i]);
        }
      } else {
        if (game.players[i].alive === false) globalScore += 1000;
        else globalScore -= 10 * this.playerScore(game, game.players[i]);
      }
    }
    return globalScore;
  }

  private qualityKey(tile: Tile): string {
    return `${tile.q},${tile.r},${tile.s}`;
  }
  private mapQuality(game: Game): MapQuality {
    const player = game.getCurrentPlayer();
    const nearByTiles = (tile: Tile): Tile[] => {
      const center = tile.getCoordinates();
      const neighbors: QRSCoord[] = Array(6)
        .fill(0)
        .map((_, i) => {
          return Tile.addVectors([
            center,
            Tile.dirToVec(Tile.directionVector(i, 1)),
          ]);
        });
      return game.map.tiles.filter((t: Tile) => {
        return neighbors.some((n: QRSCoord) => t.same(n));
      });
    };
    const isMyBaseTile = (tile: Tile) =>
      tile.owner &&
      tile.owner.id === player.id &&
      tile.building &&
      (tile.building.type === BuildingType.BASE ||
        tile.building.type === BuildingType.FARM);
    const isEnemyBuildingTile = (tile: Tile) =>
      tile.owner && tile.owner.id !== player.id && tile.building;
    const isEnemyUnit = (tile: Tile) =>
      tile.owner && tile.owner.id !== player.id && tile.unit;
    const isEnemyEmptyTile = (tile: Tile) =>
      tile.owner && tile.owner.id !== player.id && !tile.unit && !tile.building;

    const quality = new Map();

    const setTile = (tile: Tile) => {
      const isNeutral = !tile.owner;
      const isMine = !isNeutral && tile.owner!.id === player.id;
      const isEnemy = !isNeutral && !isMine;
      const _isEnemyUnit = isEnemy && tile.unit;
      const isEnemyBuilding = isEnemy && tile.building;
      const isEnemyEmpty = isEnemy && !tile.unit && !tile.building;
      const neighbors = nearByTiles(tile);
      const nextMyBase = neighbors.some(t => isMyBaseTile(t));
      const nextEnemyBuilding =
        (isMine || isNeutral) && neighbors.some(t => isEnemyBuildingTile(t));
      const nextEnemyUnit =
        (isMine || isNeutral) && neighbors.some(t => isEnemyUnit(t));
      const nextEnemyEmpty =
        (isMine || isNeutral) && neighbors.some(t => isEnemyEmptyTile(t));

      const q = {
        isNeutral,
        isMine,
        isEnemy,
        isEnemyUnit: _isEnemyUnit,
        isEnemyBuilding,
        isEnemyEmpty,
        nextMyBase,
        nextEnemyBuilding,
        nextEnemyUnit,
        nextEnemyEmpty,
      };

      quality.set(this.qualityKey(tile), q);
    };
    for (const tile of game.map.tiles) {
      setTile(tile);
    }
    return quality;
  }

  /* Moves are divided into 4 stages:
     First build farms
     Then move units
     Then build towers
     Then build units
  */
  private getMovesStage1(
    game: Game,
    myTiles: Tile[],
    mapQuality: MapQuality
  ): HexMove[] {
    // Allow 1 farm each 12 tiles and 5 units
    const player = game.getCurrentPlayer();
    if (player.gold < Building.getPrice(BuildingType.FARM)) return [];
    const farms = myTiles.filter(
      t => t.building && t.building.type === BuildingType.FARM
    ).length;
    const maxFarmsForUnits = (myTiles.filter(t => t.unit).length / 5) | 0;
    const maxFarmForTiles = (myTiles.length / 10) | 0;
    if (Math.max(maxFarmsForUnits, maxFarmForTiles) <= farms) {
      return [];
    }

    const firstTile = game.getBuildingTiles(player).find(b => {
      const tileStats = mapQuality.get(this.qualityKey(b));
      if (!tileStats) throw new Error('Missing tile stats');
      return tileStats.nextMyBase;
    });
    if (!firstTile) return [];

    return [
      {
        type: 'build',
        building: BuildingType.FARM,
        place: firstTile.getCoordinates(),
      },
    ];
  }

  private getMovesStage2(
    game: Game,
    myTiles: Tile[],
    mapQuality: MapQuality
  ): HexMove[] {
    // only check 3 units max.
    let count = 3;
    const units = myTiles
      .filter(t => t.unit && t.unit.canMove)
      .sort(() => Math.random() - 0.5)
      .filter(() => count-- > 0);

    const moves: {
      type: 'moveUnit';
      unit: {q: number; r: number; s: number};
      place: {q: number; r: number; s: number};
    }[] = [];
    const addMoves = (unit: Tile, tiles: Tile[]) => {
      tiles.forEach(tile =>
        moves.push({
          type: 'moveUnit',
          unit: unit.getCoordinates(),
          place: tile.getCoordinates(),
        })
      );
    };

    units.forEach(unit => {
      const places = game.getUnitMovement(unit);
      const quality = places.map(place => ({
        place,
        q: mapQuality.get(this.qualityKey(place))!,
      }));
      const checkFilter = (
        tiles: {place: Tile; q: MapQualityItem}[],
        f: (q: {place: Tile; q: MapQualityItem}) => boolean
      ) => {
        const priority = tiles.filter(t => f(t));
        if (priority.length) {
          addMoves(
            unit,
            priority.map(p => p.place)
          );
          return true;
        }
        return false;
      };

      if (checkFilter(quality, q => q.q?.isEnemyBuilding)) return;
      if (checkFilter(quality, q => q.q?.isEnemyUnit)) return;
      if (checkFilter(quality, q => q.q?.isEnemyEmpty)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyEmpty)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyBuilding)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyUnit)) return;
      if (checkFilter(quality, q => q.q?.isNeutral)) return;
      if (checkFilter(quality, q => q.q?.isMine)) return;
    });

    return moves;
  }

  private getMovesStage3(
    game: Game,
    myTiles: Tile[],
    mapQuality: MapQuality
  ): HexMove[] {
    const player = game.getCurrentPlayer();
    const gpt = player.goldPerRound(game.map);

    const placeUnits: {
      type: 'placeUnit';
      unit: UnitType;
      place: {q: number; r: number; s: number};
    }[] = [];

    const addMoves = (unit: UnitType, tiles: Tile[]) => {
      tiles.forEach(tile =>
        placeUnits.push({
          type: 'placeUnit',
          unit,
          place: tile.getCoordinates(),
        })
      );
    };

    const units = [
      UnitType.UNIT_1,
      UnitType.UNIT_2,
      UnitType.UNIT_3,
      UnitType.UNIT_4,
    ]
      .filter(unit => player.gold >= Unit.getPrice(unit))
      .filter(unit => gpt + Unit.getMaintenancePrice(unit) >= 0);

    units.forEach(unit => {
      const unitTiles = game.getNewUnitTiles(player, unit);
      const quality = unitTiles.map(place => ({
        place,
        q: mapQuality.get(this.qualityKey(place))!,
      }));
      const checkFilter = (
        tiles: {place: Tile; q: MapQualityItem}[],
        f: (q: {place: Tile; q: MapQualityItem}) => boolean
      ) => {
        const priority = tiles.filter(t => f(t));
        if (priority.length) {
          addMoves(
            unit,
            priority.map(p => p.place)
          );
          return true;
        }
        return false;
      };

      if (checkFilter(quality, q => q.q?.isEnemyBuilding)) return;
      if (checkFilter(quality, q => q.q?.isEnemyUnit)) return;
      if (checkFilter(quality, q => q.q?.isEnemyEmpty)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyEmpty)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyBuilding)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyUnit)) return;
      if (checkFilter(quality, q => q.q?.isNeutral)) return;
      if (checkFilter(quality, q => q.q?.isMine)) return;
    });

    return placeUnits;
  }

  private getMovesStage4(
    game: Game,
    myTiles: Tile[],
    mapQuality: MapQuality
  ): HexMove[] {
    // Allow 1 farm each 12 tiles and 5 units
    const player = game.getCurrentPlayer();
    const gpt = player.goldPerRound(game.map);

    const towers = myTiles.filter(
      t =>
        t.building &&
        (t.building.type === BuildingType.TOWER ||
          t.building.type === BuildingType.TOWER2)
    );
    const maxTowerForUnits = (myTiles.filter(t => t.unit).length / 5) | 0;
    const maxTowerForTiles = (myTiles.length / 10) | 0;
    if (Math.max(maxTowerForUnits, maxTowerForTiles) <= towers.length) {
      return [];
    }

    const buildings = [BuildingType.TOWER, BuildingType.TOWER2]
      .filter(
        building => game.getCurrentPlayer().gold >= Building.getPrice(building)
      )
      .filter(building => gpt + Building.getMaintenancePrice(building) >= 0);

    if (!buildings) return [];

    const placeUnits: {
      type: 'build';
      building: BuildingType;
      place: {q: number; r: number; s: number};
    }[] = [];

    const addMoves = (building: BuildingType, tiles: Tile[]) => {
      tiles.forEach(tile =>
        placeUnits.push({
          type: 'build',
          building,
          place: tile.getCoordinates(),
        })
      );
    };

    buildings.forEach(building => {
      const buildingTiles = game.getBuildingTiles(player);
      const quality = buildingTiles.map(place => ({
        place,
        q: mapQuality.get(this.qualityKey(place))!,
      }));
      const checkFilter = (
        tiles: {place: Tile; q: MapQualityItem}[],
        f: (q: {place: Tile; q: MapQualityItem}) => boolean
      ) => {
        const priority = tiles.filter(t => f(t));
        if (priority.length) {
          addMoves(
            building,
            priority.map(p => p.place)
          );
          return true;
        }
        return false;
      };

      if (checkFilter(quality, q => q.q?.nextEnemyUnit)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyBuilding)) return;
      if (checkFilter(quality, q => q.q?.nextEnemyEmpty)) return;
    });

    return placeUnits;
  }

  private getAllMoves(game: Game): HexMove[] {
    const mapQuality = this.mapQuality(game);
    const player = game.getCurrentPlayer();
    const myTiles = game.getMyTiles(player);
    const stage1 = this.getMovesStage1(game, myTiles, mapQuality);
    if (stage1.length) return stage1;

    const stage2 = this.getMovesStage2(game, myTiles, mapQuality);
    if (stage2.length) return stage2;

    const stage3 = this.getMovesStage3(game, myTiles, mapQuality);
    if (stage3.length) return stage3;

    const stage4 = this.getMovesStage4(game, myTiles, mapQuality);
    if (stage4.length) return stage4;

    return [];
  }

  // return array of moves and endturn.
  randomMove(game: Game) {
    if (game.getCurrentPlayerId() !== this.id) {
      throw new Error("It's not my turn!");
    }
    // eslint-disable-next-line no-constant-condition
    if (1) {
      this.minMaxMove(game);
      return;
    }

    // TODO THIS MIGHT NOT WORK ANYMORE. GOLD PER TURN IS NOT CALCULATED.
    while (game.currentPlayerHasMoves()) {
      try {
        const unitTile = game
          .getMyTiles(this)
          .find(
            tile => tile.unit && tile.unit.canMove && tile.owner?.id === this.id
          );
        const moves = unitTile ? game.getUnitMovement(unitTile) : [];
        const buildingTiles = game.getBuildingTiles(this);
        const unitTiles = game.getNewUnitTiles(this, UnitType.UNIT_1);
        if (unitTile && moves.length) {
          const priority0 = moves.filter(
            m => m.owner?.id === this.id && m.building
          );
          if (priority0.length) {
            const move =
              priority0[Math.floor(Math.random() * priority0.length)];
            game.moveUnit(this, unitTile, move);
            continue;
          }
          const priority1 = moves.filter(m => m.owner?.id !== this.id);
          if (priority1.length) {
            const move =
              priority1[Math.floor(Math.random() * priority1.length)];
            game.moveUnit(this, unitTile, move);
            continue;
          }
          const priority2 = moves.filter(m => !m.owner);
          if (priority2.length) {
            const move =
              priority2[Math.floor(Math.random() * priority2.length)];
            game.moveUnit(this, unitTile, move);
            continue;
          }
          const move = moves[Math.floor(Math.random() * moves.length)];
          game.moveUnit(this, unitTile, move);
          continue;
        } else if (
          buildingTiles.length &&
          this.gold >= Building.getPrice(BuildingType.FARM)
        ) {
          const tile =
            buildingTiles[Math.floor(Math.random() * buildingTiles.length)];
          game.placeBuilding(this, tile, BuildingType.FARM);
          continue;
        } else if (
          unitTiles.length &&
          this.gold >= Unit.getPrice(UnitType.UNIT_1)
        ) {
          const priority0 = unitTiles.filter(t => !t.owner);
          if (priority0.length) {
            const tile =
              priority0[Math.floor(Math.random() * priority0.length)];
            game.placeUnit(this, tile, UnitType.UNIT_1);
            continue;
          }
          const tile = unitTiles[Math.floor(Math.random() * unitTiles.length)];
          game.placeUnit(this, tile, UnitType.UNIT_1);
          continue;
        }
        throw new Error('No moves?');
      } catch (e) {
        console.log('AI ERROR', e);
        break;
      }
    }
    game.endTurn();
  }
}
