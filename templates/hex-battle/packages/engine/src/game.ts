import {Building, BuildingType} from './building';
import {GameMap} from './map';
import {GameAction, Moves} from './moves';
import {Player} from './player';
import {Tile} from './tile';
import {Unit, UnitType} from './unit';

export class Game {
  public winner: Player | null = null;
  public turn = 0;
  public currentPlayerIndex = 0;
  public moves: Moves[] = [];
  // public firstPlayerId;

  constructor(
    public lobbyId: string,
    public map: GameMap,
    public players: Player[],
    public localWallet: string,
    public startBlockheight: number
  ) {
    // this.firstPlayerId = players[0].id;
  }

  public static export(game: Game) {
    return JSON.stringify(game);
  }

  public static import(data: string): Game {
    const gameData = JSON.parse(data);

    const players: Player[] = gameData.players.map((p: Player) => {
      // The on-chain (deterministic) engine has no AI players — every player is
      // a human wallet, so we always rehydrate a human Player.
      const player = new Player(p.id, p.gold, p.wallet);
      player.alive = p.alive;
      return player;
    });

    const tiles = gameData.map.tiles.map((t: Tile) => {
      const tile = new Tile(t.q, t.r, t.s);
      if (t.owner) {
        const owner = players.find(p => p.id === t.owner!.id) as Player;
        tile.owner = owner;
        tile.building =
          (t.building && new Building(owner, t.building.type)) || null;
        if (t.unit) {
          const u = new Unit(owner, t.unit.type, t.unit.id);
          u.canMove = t.unit.canMove;
          tile.unit = u;
        } else {
          tile.unit = null;
        }
      } else {
        tile.owner = null;
        tile.building = null;
        tile.unit = null;
      }
      return tile;
    });

    const gameMap = new GameMap(tiles);

    const game = new Game(
      gameData.lobbyId,
      gameMap,
      players,
      gameData.localWallet,
      gameData.startBlockheight
    );
    game.winner = gameData.winner;
    game.turn = gameData.turn;
    game.currentPlayerIndex = gameData.currentPlayerIndex;
    game.moves = [];
    return game;
  }

  public getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }
  public getCurrentPlayerId() {
    return this.players[this.currentPlayerIndex].id;
  }

  // return true if player has any more moves this turn.
  public currentPlayerHasMoves() {
    if (
      this.getCurrentPlayer().gold >= Math.min(Unit.getPrice(UnitType.UNIT_1))
    ) {
      return true;
    }

    return this.map.tiles.some(t => {
      if (
        t.owner &&
        t.owner.id === this.getCurrentPlayerId() &&
        t.unit &&
        t.unit.canMove
      ) {
        return true;
      }
      return false;
    });
  }

  // Get distance between two tiles.
  public distance(tile1: Tile, tile2: Tile) {
    return (
      (Math.abs(tile1.q - tile2.q) +
        Math.abs(tile1.r - tile2.r) +
        Math.abs(tile1.s - tile2.s)) /
      2
    );
  }

  // Get tiles that are within "distance" from tile.
  public getMovingDistance(tile: Tile, distance: number): Tile[] {
    return this.map.tiles.filter(x => this.distance(tile, x) <= distance);
  }

  // Get rules for unit movement
  public getUnitMovement(tile: Tile) {
    const naturalMove = this.getMovingDistance(tile, 1);
    const localMove = this.getMyTilesFromTileDistance(
      this.getCurrentPlayer(),
      tile,
      2
    );
    const extendedMove = localMove
      .map(t => this.getMovingDistance(t, 1))
      .flat();

    const tiles = [...naturalMove, ...localMove, ...extendedMove];

    return tiles.filter(t => {
      if (!t.owner) return true;
      if (t.owner && t.owner.id === this.getCurrentPlayerId()) {
        const ocuppied = t.building || t.unit;
        return !ocuppied;
      }
      let maxDefender = 0;

      if (t.unit) {
        if (Unit.getPowerLevel(t.unit!.type) > maxDefender) {
          maxDefender = Unit.getPowerLevel(t.unit!.type);
        }
      }

      if (t.building) {
        if (Building.getPowerLevel(t.building.type) > maxDefender) {
          maxDefender = Building.getPowerLevel(t.building.type);
        }
      }

      // check if defended.
      const nearby = this.getMovingDistance(t, 1);

      const hasDefenders = nearby.filter(
        n => n.owner && n.owner.id === t.owner?.id && n.unit
      );
      const hasTowers = nearby.filter(
        n =>
          n.owner &&
          n.owner.id === t.owner?.id &&
          n.building &&
          Building.defensiveArea(n.building.type) > 0
      );

      hasDefenders.forEach(d => {
        if (Unit.getPowerLevel(d.unit!.type) > maxDefender)
          maxDefender = Unit.getPowerLevel(d.unit!.type);
      });

      hasTowers.forEach(d => {
        if (Building.getPowerLevel(d.building!.type) > maxDefender)
          maxDefender = Building.getPowerLevel(d.building!.type);
      });

      return Unit.getPowerLevel(tile.unit!.type) > maxDefender;
    });
  }

  // Get all tiles for player
  public getMyTiles(player: Player) {
    return this.map.tiles.filter(t => t.owner && t.owner.id === player.id);
  }

  // Get tiles that are within "distance" from any of my tiles.
  public getNearbyTiles(player: Player, distance: number): Tile[] {
    const myTiles = this.getMyTiles(player);
    return this.map.tiles
      .filter(t => !t.owner || t.owner.id !== player.id)
      .map(t => {
        const minDistance = myTiles.reduce((min, tile) => {
          return Math.min(min, this.distance(t, tile));
        }, Number.MAX_SAFE_INTEGER);
        return {tile: t, distance: minDistance};
      })
      .filter(x => x.distance <= distance)
      .map(x => x.tile);
  }

  // Get all legal tiles for new units
  public getNewUnitTiles(player: Player, unitType: UnitType): Tile[] {
    const tiles = this.getNearbyTiles(player, 1);
    const myTile = this.getMyTiles(player);
    return [...myTile, ...tiles].filter(t => {
      if (!t.owner) return true;
      if (t.owner && t.owner.id === player.id) {
        const ocuppied = t.building || t.unit;
        return !ocuppied;
      }

      let maxDefender = 0;

      if (t.unit) {
        if (Unit.getPowerLevel(t.unit!.type) > maxDefender) {
          maxDefender = Unit.getPowerLevel(t.unit!.type);
        }
      }

      if (t.building) {
        if (Building.getPowerLevel(t.building.type) > maxDefender) {
          maxDefender = Building.getPowerLevel(t.building.type);
        }
      }

      // check if defended.
      const nearby = this.getMovingDistance(t, 1);

      const hasDefenders = nearby.filter(
        n => n.owner && n.owner.id === t.owner?.id && n.unit
      );
      const hasTowers = nearby.filter(
        n =>
          n.owner &&
          n.owner.id === t.owner?.id &&
          n.building &&
          Building.defensiveArea(n.building.type) > 0
      );

      hasDefenders.forEach(d => {
        if (Unit.getPowerLevel(d.unit!.type) > maxDefender)
          maxDefender = Unit.getPowerLevel(d.unit!.type);
      });

      hasTowers.forEach(d => {
        if (Building.getPowerLevel(d.building!.type) > maxDefender)
          maxDefender = Building.getPowerLevel(d.building!.type);
      });

      return Unit.getPowerLevel(unitType) > maxDefender;
    });
  }

  // Get all legal tiles for new buildings
  public getBuildingTiles(player: Player): Tile[] {
    return this.getMyTiles(player).filter(t => {
      return !t.building && !t.unit;
    });
  }

  // Get player owned tiles that are within "distance" from tile.
  public getMyTilesFromTileDistance(
    player: Player,
    tile: Tile,
    distance: number
  ) {
    return this.getMyTiles(player).filter(
      t => this.distance(tile, t) <= distance
    );
  }

  // Check if action is valid
  public isValid(player: Player, action: GameAction): void {
    if (player.id !== this.getCurrentPlayerId()) {
      throw new Error('It is not player turn');
    }

    switch (action.type) {
      case 'surrender': {
        if (player.id !== this.getCurrentPlayerId()) {
          throw new Error('It is not player turn');
        }
        break;
      }

      case 'new_building':
        {
          if (!action.newBuildingType) {
            throw new Error('Missing building type');
          }

          const price = Building.getPrice(action.newBuildingType);
          if (price > player.gold) {
            throw new Error('Not enough gold');
          }
          const maintenance = Building.getMaintenancePrice(
            action.newBuildingType
          );
          if (
            maintenance < 0 &&
            player.goldPerRound(this.map) + maintenance < 0
          ) {
            throw new Error('Cannot build. Cannot pay maintenance');
          }

          const target: Tile | null = action.original[0];
          if (!target) throw new Error('No target tile');

          const tiles = this.getBuildingTiles(player);
          if (!tiles.find(t => t.same(target))) {
            throw new Error('Cannot build in target tile');
          }
        }
        break;

      case 'new_unit': {
        const target: Tile | null = action.original[0];
        if (!target) throw new Error('No target tile');
        if (!action.newUnitType) throw new Error('No unit type');
        const tiles = this.getNewUnitTiles(player, action.newUnitType);
        if (!tiles.find(t => t.same(target))) {
          throw new Error('Target tile is not nearby');
        }
        const price = Unit.getPrice(action.newUnitType);
        if (price > player.gold) {
          throw new Error('Not enough gold');
        }
        const maintenance = Unit.getMaintenancePrice(action.newUnitType);
        if (
          maintenance < 0 &&
          player.goldPerRound(this.map) + maintenance < 0
        ) {
          throw new Error('Cannot build. Cannot pay maintenance');
        }
        break;
      }

      case 'move':
        {
          const target: Tile | null = action.original[0];
          const origin: Tile | null = action.original[1];
          if (!target || !origin) throw new Error('Missing target or origin');
          if (!origin.unit) throw new Error('No unit at origin');
          if (!origin.unit.canMove)
            throw new Error('Unit already moved this turn');
          if (origin.owner && origin.owner.id !== player.id) {
            throw new Error('Origin tile is not yours');
          }

          const isAttack = target.owner && target.owner.id !== player.id;
          if (isAttack) {
            // check rules of battle.
          } else {
            if (target.unit) throw new Error('Unit in destination');
            if (target.building) throw new Error('Building in destination');
          }
          const targetTiles = this.getUnitMovement(origin);
          if (!targetTiles.find(t => t.same(target)))
            throw new Error('Target tile is too far');
        }
        break;
    }
  }

  public initMoves(player: Player) {
    if (!this.moves[this.turn]) {
      this.moves[this.turn] = new Moves(player, this.turn);
    } else if (this.moves[this.turn].player.id !== player.id) {
      throw new Error('CRITICAL ERROR. Invalid turn for player');
    }
  }

  // ACTION: place new building
  public placeBuilding(
    player: Player,
    target: Tile,
    buildingType: BuildingType
  ): GameAction {
    const action: GameAction = new GameAction(
      'new_building',
      target.getCoordinates(),
      null,
      null,
      null,
      buildingType
    );
    action.setTile(target);

    try {
      this.isValid(player, action);
    } catch (e) {
      console.log('Cannot apply move:', (e as Error).message);
      throw e;
    }

    this.initMoves(player);
    return this.moves[this.turn].applyPlaceBuilding(this, action);
  }

  // ACTION: surrender
  public surrender(player: Player): GameAction {
    const action = new GameAction('surrender', null, null, null, null, null);
    try {
      this.isValid(player, action);
    } catch (e) {
      console.log('Cannot apply move:', (e as Error).message);
      throw e;
    }

    this.initMoves(player);
    return this.moves[this.turn].applySurrender(this, action);
  }

  // ACTION: create new unit
  public placeUnit(
    player: Player,
    target: Tile,
    unitType: UnitType
  ): GameAction {
    const action: GameAction = new GameAction(
      'new_unit',
      target.getCoordinates(),
      null,
      null,
      unitType,
      null
    );
    action.setTile(target);

    try {
      this.isValid(player, action);
    } catch (e) {
      console.log('Cannot apply move:', (e as Error).message);
      throw e;
    }

    this.initMoves(player);

    return this.moves[this.turn].applyPlaceUnit(this, action);
  }

  // ACTION: move unit from tileA to tileB
  public moveUnit(player: Player, origin: Tile, target: Tile): GameAction {
    const action: GameAction = new GameAction(
      'move',
      target.getCoordinates(),
      origin.getCoordinates(),
      origin.unit!.id,
      null,
      null
    );
    action.setTile(target);
    action.setTile(origin);

    try {
      this.isValid(player, action);
    } catch (e) {
      console.log('Cannot apply move:', (e as Error).message);
      throw e;
    }

    this.initMoves(player);

    return this.moves[this.turn].applyMoveUnit(this, action);
  }

  public undo() {
    const currentTurnMoves = this.moves[this.turn];
    if (!currentTurnMoves) {
      throw new Error('No moves this turn to undo');
    }

    if (!currentTurnMoves.actions.length) {
      throw new Error('No actions this turn to undo');
    }

    const lastAction =
      currentTurnMoves.actions[currentTurnMoves.actions.length - 1];
    currentTurnMoves.applyUndo(this, lastAction);
    currentTurnMoves.actions.pop();
  }

  public endTurn() {
    if (this.winner) {
      throw new Error('Game is over');
    }
    // is game done
    if (this.players.filter(p => p.alive).length === 1) {
      this.winner = this.players.find(p => p.alive) as Player;
      return;
    }

    // award user with gold.
    const playerEndingTurn = this.getCurrentPlayer();
    playerEndingTurn.getGold(this.map);

    // apply negative gold penalty
    while (playerEndingTurn.goldPerRound(this.map) < 0) {
      const tiles = this.getMyTiles(playerEndingTurn);
      // Get all tiles that have units or buildings and sort by maintenance cost
      const myUnitsAndBuildings = tiles
        .filter(
          t =>
            t.owner &&
            t.owner.id === playerEndingTurn.id &&
            (t.unit ||
              (t.building &&
                (t.building.type === BuildingType.TOWER ||
                  t.building.type === BuildingType.TOWER2)))
        )
        .sort((a, b) => {
          const aCost = a.unit
            ? Unit.getMaintenancePrice(a.unit.type)
            : Building.getMaintenancePrice(a.building!.type);
          const bCost = b.unit
            ? Unit.getMaintenancePrice(b.unit.type)
            : Building.getMaintenancePrice(b.building!.type);
          return aCost - bCost;
        });

      // select least amount of units that give non-negative gold per turn
      if (myUnitsAndBuildings.length) {
        const gpt = playerEndingTurn.goldPerRound(this.map);
        let bestCandidate: Tile | undefined;
        myUnitsAndBuildings.forEach(t => {
          if (t.unit && gpt >= Unit.getMaintenancePrice(t.unit.type)) {
            bestCandidate = t;
          }
          if (
            t.building &&
            gpt >= Building.getMaintenancePrice(t.building.type)
          ) {
            bestCandidate = t;
          }
        });

        if (bestCandidate) {
          bestCandidate.unit = null;
          bestCandidate.building = null;
        } else {
          // no best candidate, then remove most expensive
          myUnitsAndBuildings[0].unit = null;
          myUnitsAndBuildings[0].building = null;
        }
      } else {
        throw new Error('No units to remove. This should not happen.');
      }
    }

    this.turn += 1;
    do {
      // move player index
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.players.length;
    } while (!this.getCurrentPlayer().alive);

    const player = this.getCurrentPlayer();
    this.map.tiles
      .filter(t => t.owner && t.owner.id === player.id)
      .filter(t => t.unit)
      .map(t => t.unit as Unit)
      .forEach(u => (u.canMove = true));
  }
}
