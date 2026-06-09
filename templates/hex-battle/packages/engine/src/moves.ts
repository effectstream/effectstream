import {QRSCoord} from './hex';
import {BuildingType, Building} from './building';
import {Game} from './game';
import {Player} from './player';
import {Tile} from './tile';
import {UnitType, Unit} from './unit';

type GameActionType = 'move' | 'new_unit' | 'new_building' | 'surrender';

export class GameAction {
  public updates: Tile[] = [];
  public original: Tile[] = [];
  public goldDelta = 0;
  public defeat_target: string | null = null;

  constructor(
    public type: GameActionType,
    public target: QRSCoord | null,
    public origin: QRSCoord | null,
    public unitMoved: string | null,
    public newUnitType: UnitType | null,
    public newBuildingType: BuildingType | null
  ) {
    if (type === 'new_building') {
      this.goldDelta = Building.getPrice(newBuildingType!) * -1;
    }
    if (type === 'new_unit') {
      this.goldDelta = Unit.getPrice(newUnitType!) * -1;
    }
  }

  setTile(tile: Tile): number {
    this.original.push(tile.copyTile());
    this.updates.push(tile.copyTile());
    return this.original.length - 1;
  }
}

export class Moves {
  public actions: GameAction[];
  constructor(
    public player: Player,
    public turn: number
  ) {
    this.actions = [];
  }

  public static deserializePaima(
    game: Game,
    data: {move: string; round: number; wallet: string}
  ): Moves {
    /*
      block_height: 0
      id: 1
      lobby_id: "BSrMkAB0Ih3i"
      move: "[\"{\\\"targetQ\\\":1,\\\"targetR\\\":-3,\\\"targetS\\\":2,\\\"originQ\\\":1,\\\"originR\\\":-4,\\\"originS\\\":3}\"]"
      round: 0
      wallet: "0xeeacbe169ad0eb650e8130fc918e2fde0d8548b3"
    */
    const player = game.players.find(p => p.wallet === data.wallet);
    const move = new Moves(player!, data.round);
    move.actions = JSON.parse(data.move)
      .map((moveData: string) => JSON.parse(moveData))
      .map(
        (moveData: {
          build: string;
          targetQ: number;
          targetR: number;
          targetS: number;
          originQ: number;
          originR: number;
          originS: number;
        }) => {
          // if target is not defined, it's a surrender
          if (
            typeof moveData.targetQ !== 'number' &&
            typeof moveData.targetR !== 'number' &&
            typeof moveData.targetS !== 'number'
          ) {
            // Surrender!
            const action = new GameAction(
              'surrender',
              null,
              null,
              null,
              null,
              null
            );
            return action;
          }

          const targetQRS = {
            q: moveData.targetQ,
            r: moveData.targetR,
            s: moveData.targetS,
          };
          const originQRS = {
            q: moveData.originQ,
            r: moveData.originR,
            s: moveData.originS,
          };

          if (moveData.build) {
            switch (moveData.build) {
              case 'F': {
                const action = new GameAction(
                  'new_building',
                  targetQRS,
                  null,
                  null,
                  null,
                  BuildingType.FARM
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 't': {
                const action = new GameAction(
                  'new_building',
                  targetQRS,
                  null,
                  null,
                  null,
                  BuildingType.TOWER
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 'T': {
                const action = new GameAction(
                  'new_building',
                  targetQRS,
                  null,
                  null,
                  null,
                  BuildingType.TOWER2
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 'A': {
                const action = new GameAction(
                  'new_unit',
                  targetQRS,
                  null,
                  null,
                  UnitType.UNIT_1,
                  null
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 'B': {
                const action = new GameAction(
                  'new_unit',
                  targetQRS,
                  null,
                  null,
                  UnitType.UNIT_2,
                  null
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 'C': {
                const action = new GameAction(
                  'new_unit',
                  targetQRS,
                  null,
                  null,
                  UnitType.UNIT_3,
                  null
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              case 'D': {
                const action = new GameAction(
                  'new_unit',
                  targetQRS,
                  null,
                  null,
                  UnitType.UNIT_4,
                  null
                );
                action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
                return action;
              }
              default:
                throw new Error('Missing serialization instructions');
            }
          } else {
            const unitTile = game.map.tiles.find(t => t.same(originQRS));
            if (!unitTile || !unitTile.unit)
              throw new Error('Missing unit at origin tile');
            const action = new GameAction(
              'move',
              targetQRS,
              originQRS,
              unitTile.unit.id,
              null,
              null
            );
            action.setTile(game.map.tiles.find(t => t.same(targetQRS))!);
            action.setTile(game.map.tiles.find(t => t.same(originQRS))!);
            return action;
          }
        }
      );
    return move;
  }

  serializePaima(): string[] {
    // format1: [build_type][q_target]#[r_target]
    // format2: [q_target]#[r_target]#[q_origin]#[r_origin]
    const format1 = (x: BuildingType | UnitType, target: QRSCoord) => {
      switch (x) {
        case BuildingType.FARM:
          return `F${target.q}#${target.r}`;
        case BuildingType.TOWER:
          return `t${target.q}#${target.r}`;
        case BuildingType.TOWER2:
          return `T${target.q}#${target.r}`;
        case UnitType.UNIT_1:
          return `A${target.q}#${target.r}`;
        case UnitType.UNIT_2:
          return `B${target.q}#${target.r}`;
        case UnitType.UNIT_3:
          return `C${target.q}#${target.r}`;
        case UnitType.UNIT_4:
          return `D${target.q}#${target.r}`;
        default:
          throw new Error('Missing serialization instructions');
      }
    };

    const format2 = (target: QRSCoord, origin: QRSCoord) => {
      return `${target.q}#${target.r}#${origin.q}#${origin.r}`;
    };

    return this.actions.map(action => {
      switch (action.type) {
        case 'surrender':
          return 'surrender';
        case 'move':
          return format2(action.target!, action.origin!);
        case 'new_unit':
          return format1(action.newUnitType!, action.target!);
        case 'new_building':
          return format1(action.newBuildingType!, action.target!);
        default:
          throw new Error('Missing serialization instructions');
      }
    });
  }

  serialize(): string {
    return JSON.stringify(this.actions);
  }

  static deserialize(serialMove: string): Moves {
    const m: Moves = JSON.parse(serialMove);
    const player = new Player(m.player.id, m.player.gold, m.player.wallet);
    player.isHuman = m.player.isHuman;
    player.alive = m.player.alive;

    const move = new Moves(player, m.turn);
    move.actions = m.actions.map(moveData => {
      const gameAction = new GameAction(
        moveData.type,
        moveData.target,
        moveData.origin,
        moveData.unitMoved,
        moveData.newUnitType,
        moveData.newBuildingType
      );
      gameAction.goldDelta = moveData.goldDelta;
      gameAction.defeat_target = moveData.defeat_target;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameAction.updates = moveData.updates.map((tileData: any) => {
        const tile = new Tile(tileData.q, tileData.r, tileData.s);
        tile.owner = tileData.owner;
        tile.unit = tileData.unit;
        tile.building = tileData.building;
        return tile;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gameAction.original = moveData.original.map((tileData: any) => {
        const tile = new Tile(tileData.q, tileData.r, tileData.s);
        tile.owner = tileData.owner;
        tile.unit = tileData.unit;
        tile.building = tileData.building;
        return tile;
      });
      return gameAction;
    });
    return move;
  }

  public applyUndo(game: Game, action: GameAction) {
    this.player.gold -= action.goldDelta;

    if (action.defeat_target) {
      game.players.find(p => p.id === action.defeat_target)!.alive = true;
    }

    for (const original of action.original) {
      for (let i = 0; i < game.map.tiles.length; i++) {
        if (game.map.tiles[i].same(original)) {
          game.map.tiles[i] = original;
          break;
        }
      }
    }

    if (action.unitMoved) {
      const unitTile = game.map.tiles.find(
        t => t.unit && t.unit.id === action.unitMoved
      );
      unitTile!.unit!.canMove = true;
    }
  }

  private applyEffects(game: Game, action: GameAction) {
    this.player.gold += action.goldDelta;

    if (action.defeat_target) {
      game.players.find(p => p.id === action.defeat_target)!.alive = false;
    }

    for (const update of action.updates) {
      for (let i = 0; i < game.map.tiles.length; i++) {
        if (game.map.tiles[i].same(update)) {
          game.map.tiles[i] = update;
          break;
        }
      }
    }

    if (action.unitMoved) {
      const unitTile = game.map.tiles.find(
        t => t.unit && t.unit.id === action.unitMoved
      );
      unitTile!.unit!.canMove = false;
    }
  }

  private defeatPlayer(
    game: Game,
    action: GameAction,
    defeatedPlayerId: string,
    skipTile: {q: number; r: number; s: number} | undefined
  ) {
    action.defeat_target = defeatedPlayerId;
    game.map.tiles
      .filter(t => {
        if (
          skipTile &&
          t.q === skipTile.q &&
          t.r === skipTile.r &&
          t.s === skipTile.s
        ) {
          return false;
        }

        return t.owner && t.owner?.id === defeatedPlayerId;
      })
      .forEach(t => {
        const index = action.setTile(t);
        action.updates[index].owner = null;
        action.updates[index].unit = null;
        action.updates[index].building = null;
      });
  }

  private attack(game: Game, action: GameAction, unit: Unit) {
    const newTarget = action.updates[0];
    const newOrigin = action.updates[1];
    const oldTarget = action.original[0];
    // const oldOrigin = action.original[1];

    if (!newTarget || !oldTarget) {
      throw new Error('CRITIAL ERROR. Invalid target');
    }

    newTarget.unit = unit;
    newTarget.owner = this.player;
    if (newOrigin) newOrigin.unit = null;

    const isAttack = oldTarget.owner && oldTarget.owner.id !== this.player.id;

    if (isAttack) {
      if (oldTarget.building?.type === BuildingType.BASE) {
        this.defeatPlayer(
          game,
          action,
          oldTarget.owner!.id,
          oldTarget.getCoordinates()
        );
      }

      newTarget.building = null;
    }
  }

  // surrender
  public applySurrender(game: Game, action: GameAction) {
    this.defeatPlayer(game, action, this.player.id, undefined);
    this.applyEffects(game, action);
    this.actions.push(action);
    return action;
  }

  // tileA destination
  public applyPlaceUnit(game: Game, action: GameAction) {
    const unit = new Unit(
      this.player,
      action.newUnitType!,
      Unit.generateUnitId(game.turn, action.target!)
    );
    unit.canMove = false;
    this.attack(game, action, unit);
    this.applyEffects(game, action);
    this.actions.push(action);
    return action;
  }

  // tileA origin
  // tileB destination
  public applyMoveUnit(game: Game, action: GameAction) {
    this.attack(game, action, action.original[1].unit!);
    this.applyEffects(game, action);
    this.actions.push(action);
    return action;
  }

  public applyPlaceBuilding(game: Game, action: GameAction) {
    const building = new Building(this.player, action.newBuildingType!);
    action.updates[0].building = building;
    this.applyEffects(game, action);
    this.actions.push(action);
    return action;
  }
}
