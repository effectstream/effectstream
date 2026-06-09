export class DrawHex {
  // hexagon angule [radians]
  static hexside = (2 * Math.PI) / 6;
  // draw 2d hexagon
  public static drawHexagon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rotation = 0
  ) {
    for (let i = 0; i <= 6; i++) {
      ctx.lineTo(
        x + size * Math.cos(DrawHex.hexside * i + rotation),
        y + size * Math.sin(DrawHex.hexside * i + rotation)
      );
    }
    ctx.stroke();
  }

  public static drawHexagonBorder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    borderPercent: number,
    rotation = 0
  ) {
    for (let i = 0; i <= 7; i++) {
      ctx.lineTo(
        x + size * borderPercent * Math.cos(DrawHex.hexside * i + rotation),
        y + size * borderPercent * Math.sin(DrawHex.hexside * i + rotation)
      );
    }
    // ctx.lineTo(startX, startY);
    ctx.stroke();
  }

  public static longHexagon(
    ctx: CanvasRenderingContext2D,
    x_: number,
    y_: number,
    size: number,
    count_: number
  ) {
    const count = count_;
    let x = x_;
    const y = y_;
    const rotation = DrawHex.hexside / 2;
    const i = 3;
    const step = Math.cos(Math.PI / 6) * size * 2;
    ctx.moveTo(
      x + size * Math.cos(DrawHex.hexside * ((i + 0) % 6) + rotation),
      y + size * Math.sin(DrawHex.hexside * ((i + 0) % 6) + rotation)
    );
    for (let c = 0; c < count; c++) {
      // const i = 3
      ctx.lineTo(
        x + size * Math.cos(DrawHex.hexside * ((i + 1) % 6) + rotation),
        y + size * Math.sin(DrawHex.hexside * ((i + 1) % 6) + rotation)
      );
      ctx.lineTo(
        x + size * Math.cos(DrawHex.hexside * ((i + 2) % 6) + rotation),
        y + size * Math.sin(DrawHex.hexside * ((i + 2) % 6) + rotation)
      );
      x += step;
    }

    x -= step;
    ctx.lineTo(
      x + size * Math.cos(DrawHex.hexside * ((i + 3) % 6) + rotation),
      y + size * Math.sin(DrawHex.hexside * ((i + 3) % 6) + rotation)
    );

    for (let c = 0; c < count; c++) {
      ctx.lineTo(
        x + size * Math.cos(DrawHex.hexside * ((i + 4) % 6) + rotation),
        y + size * Math.sin(DrawHex.hexside * ((i + 4) % 6) + rotation)
      );
      ctx.lineTo(
        x + size * Math.cos(DrawHex.hexside * ((i + 5) % 6) + rotation),
        y + size * Math.sin(DrawHex.hexside * ((i + 5) % 6) + rotation)
      );

      x -= step;
    }
    x += step;
    ctx.lineTo(
      x + size * Math.cos(DrawHex.hexside * ((i + 6) % 6) + rotation),
      y + size * Math.sin(DrawHex.hexside * ((i + 6) % 6) + rotation)
    );

    ctx.lineTo(
      x + size * Math.cos(DrawHex.hexside * ((i + 7) % 6) + rotation),
      y + size * Math.sin(DrawHex.hexside * ((i + 7) % 6) + rotation)
    );
  }

  // draw 3dish hexagon
  public static draw3DHexagon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    x_o: number,
    y_o: number
  ) {
    let start = 0;
    let end = 0;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      start = x + size * Math.cos(DrawHex.hexside * i);
      end = y + size * Math.sin(DrawHex.hexside * i);
      ctx.lineTo(start, end);
      ctx.lineTo(start + x_o, end + y_o);
      ctx.lineTo(start, end);
    }
    ctx.lineTo(start + x_o, end + y_o);
    for (let i = 0; i <= 6; i++) {
      const start = x + size * Math.cos(DrawHex.hexside * i) + x_o;
      const end = y + size * Math.sin(DrawHex.hexside * i) + y_o;
      ctx.lineTo(start, end);
    }
    ctx.stroke();
  }
}
