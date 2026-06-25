import {QRSCoord} from './hex';
import {Player} from './player';

export enum UnitType {
  UNIT_1 = 'A',
  UNIT_2 = 'B',
  UNIT_3 = 'C',
  UNIT_4 = 'D',
}
export class Unit {
  public canMove = false;
  constructor(
    public player: Player,
    public type: UnitType, // public tile: Tile
    public id: string
  ) {}

  public static generateUnitId(turnCreated: number, tileCreated: QRSCoord) {
    return `${turnCreated}#${tileCreated.q}#${tileCreated.r}#${tileCreated.s}`;
  }

  public static getNameAndDescription(type: UnitType) {
    switch (type) {
      case UnitType.UNIT_1:
        return {name: 'Monster', description: 'Can destroy farms'};
      case UnitType.UNIT_2:
        return {name: 'Strong Monster', description: 'Can destroy bases'};
      case UnitType.UNIT_3:
        return {name: 'Master Monster', description: 'Can destroy towers'};
      case UnitType.UNIT_4:
        return {name: 'Supreme Monster', description: 'Destroys everything'};
      default:
        throw new Error('Unit type not found. Missing price');
    }
  }

  public static getPowerLevel(type: UnitType) {
    switch (type) {
      case UnitType.UNIT_1:
        return 1;
      case UnitType.UNIT_2:
        return 2;
      case UnitType.UNIT_3:
        return 3;
      case UnitType.UNIT_4:
        return 4;
      default:
        throw new Error('Unit type not found. Missing price');
    }
  }

  public static getDefensiveArea(type: UnitType) {
    switch (type) {
      case UnitType.UNIT_1:
        return 1;
      case UnitType.UNIT_2:
        return 1;
      case UnitType.UNIT_3:
        return 1;
      case UnitType.UNIT_4:
        return 1;
      default:
        throw new Error('Unit type not found. Missing price');
    }
  }

  public static getMaintenancePrice(unitType: UnitType) {
    switch (unitType) {
      case UnitType.UNIT_1:
        return -1; // -2 total from the non usage of land
      case UnitType.UNIT_2:
        return -4;
      case UnitType.UNIT_3:
        return -9;
      case UnitType.UNIT_4:
        return -19;
      default:
        throw new Error('Unit type not found. Missing price');
    }
  }

  public static getPrice(unitType: UnitType) {
    switch (unitType) {
      case UnitType.UNIT_1:
        return 10;
      case UnitType.UNIT_2:
        return 20;
      case UnitType.UNIT_3:
        return 30;
      case UnitType.UNIT_4:
        return 40;
      default:
        throw new Error('Unit type not found. Missing price');
    }
  }
}
