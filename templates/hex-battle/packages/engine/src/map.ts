import {Tile} from './tile';

export class GameMap {
  minQ: number = Number.MAX_SAFE_INTEGER;
  maxQ: number = Number.MIN_SAFE_INTEGER;
  maxR: number = Number.MIN_SAFE_INTEGER;
  minR: number = Number.MAX_SAFE_INTEGER;
  minS: number = Number.MAX_SAFE_INTEGER;
  maxS: number = Number.MIN_SAFE_INTEGER;

  constructor(public tiles: Tile[]) {
    this.updateLimits();
  }

  public updateLimits() {
    this.tiles.forEach(tile => {
      this.minQ = Math.min(this.minQ, tile.q);
      this.maxQ = Math.max(this.maxQ, tile.q);
      this.minR = Math.min(this.minR, tile.r);
      this.maxR = Math.max(this.maxR, tile.r);
      this.minS = Math.min(this.minS, tile.s);
      this.maxS = Math.max(this.maxS, tile.s);
    });
  }

  public static RingMap(minSize: number) {
    const center = new Tile(0, 0, 0);
    const tiles: Tile[] = [center];
    let radio = 1;
    while (tiles.length < minSize) {
      tiles.push(Tile.BuildTileFrom(center, 4, radio)); // south-west
      for (let dir = 0; dir < 6; dir++) {
        for (let r = 0; r < radio; r++) {
          const tx = Tile.BuildTileFrom(tiles[tiles.length - 1], dir, 1);
          if (tiles.find(t => t.q === tx.q && t.r === tx.r && t.s === tx.s)) {
            // skipping last closing.
          } else {
            tiles.push(tx);
          }
        }
      }
      radio += 1;
    }
    return new GameMap(tiles);
  }

  public getTileFrom(
    tile: Tile,
    direction: number,
    distance = 1
  ): Tile | undefined {
    const [dq, dr, ds] = Tile.directionVector(direction, distance);
    return this.tiles.find(
      t => t.q === tile.q + dq && t.r === tile.r + dr && t.s === tile.s + ds
    );
  }
}
