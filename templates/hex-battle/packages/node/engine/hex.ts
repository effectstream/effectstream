import {Tile} from './tile';

export type QRSCoord = {q: number; r: number; s: number};
export type XYCoord = {x: number; y: number};

export class Hex {
  public static qrsToXy(qrs: QRSCoord, size: number): XYCoord {
    const x = size * ((3 / 2) * qrs.q);
    const y = size * ((Math.sqrt(3) / 2) * qrs.q + Math.sqrt(3) * qrs.r);
    return {x, y};
  }

  // convert tile to pixel coordinates [x,y]
  public static pointy_hex_to_pixel(
    tile: Tile,
    size: number
  ): [number, number] {
    // cache x,y
    if ((tile as any).x && (tile as any).y)
      return [(tile as any).x, (tile as any).y];
    const {x, y} = Hex.qrsToXy(tile.getCoordinates(), size);
    (tile as any).x = x;
    (tile as any).y = y;
    return [x, y];
  }

  // get nearest tile coordinates {q,r,s} from any {q,r,s} coordiantes
  public static cube_round(frac: QRSCoord): QRSCoord {
    let q = Math.round(frac.q);
    let r = Math.round(frac.r);
    let s = Math.round(frac.s);

    const q_diff = Math.abs(q - frac.q);
    const r_diff = Math.abs(r - frac.r);
    const s_diff = Math.abs(s - frac.s);

    if (q_diff > r_diff && q_diff > s_diff) {
      q = -r - s;
    } else if (r_diff > s_diff) {
      r = -q - s;
    } else {
      s = -q - r;
    }

    return {q, r, s};
  }

  // convert pixel coordinates [x,y] to nearest tile coordinates {q,r,s}
  public static pixel_to_pointy_hex(point: XYCoord, size: number): QRSCoord {
    const q = ((2 / 3) * point.x) / size;
    const r = ((-1 / 3) * point.x + (Math.sqrt(3) / 3) * point.y) / size;
    const s = -q - r;
    return Hex.cube_round({q, r, s});
  }
}
