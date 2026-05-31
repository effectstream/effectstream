import {Building} from './building';
import {Player} from './player';
import {Unit} from './unit';

export class Tile {
  public owner: Player | null = null;
  public building: Building | null = null;
  public unit: Unit | null = null;
  constructor(
    public q: number,
    public r: number,
    public s: number //  q + r + s = 0
  ) {}

  public copyTile(): Tile {
    const tile = new Tile(this.q, this.r, this.s);
    tile.owner = this.owner;
    tile.building = this.building;
    tile.unit = this.unit;
    return tile;
  }

  public same(
    tile:
      | Tile
      | {q: number; r: number; s: number}
      | number[]
      | [number, number, number]
      | null
      | undefined
  ) {
    if (!tile) return false;
    if (Array.isArray(tile)) {
      return this.q === tile[0] && this.r === tile[1] && this.s === tile[2];
    }
    return this.q === tile.q && this.r === tile.r && this.s === tile.s;
  }

  public static directionVector(
    direction: number,
    distance = 1
  ): [number, number, number] {
    const dir: [number, number, number][] = [
      //[q  r  s]
      [1 * distance, 0, -1 * distance], // 0 south-east
      [1 * distance, -1 * distance, 0], // 1 north-east
      [0, -1 * distance, 1 * distance], // 2 north
      [-1 * distance, 0, 1 * distance], // 3 north-west
      [-1 * distance, 1 * distance, 0], // 4 south-west
      [0, 1 * distance, -1 * distance], // 5 south
    ];
    return dir[direction];
  }

  public static BuildTileFrom(tile: Tile, direction: number, distance = 1) {
    const [dq, dr, ds] = Tile.directionVector(direction, distance);
    return new Tile(tile.q + dq, tile.r + dr, tile.s + ds);
  }

  public static dirToVec(dir: [number, number, number]) {
    return {q: dir[0], r: dir[1], s: dir[2]};
  }
  public static vecToDir(vec: {
    q: number;
    r: number;
    s: number;
  }): [number, number, number] {
    return [vec.q, vec.r, vec.s];
  }
  public static addVectors(vectors: {q: number; r: number; s: number}[]) {
    return vectors.reduce(
      (acc, cur) => {
        acc.q += cur.q;
        acc.r += cur.r;
        acc.s += cur.s;
        return acc;
      },
      {q: 0, r: 0, s: 0}
    );
  }

  public getCoordinates() {
    return {q: this.q, r: this.r, s: this.s};
  }
}
