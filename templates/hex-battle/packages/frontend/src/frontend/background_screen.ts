import {Hex, QRSCoord} from '@hex-battle/engine';
import {ScreenUI} from './screen';
import {DrawHex} from './hex.draw';
import {Colors} from './colors';

export abstract class BackgroundScreen extends ScreenUI {
  drawTimer: any = null;
  hover: QRSCoord | null = null;
  size = 40;

  private background: {
    qrs: QRSCoord;
    x: number;
    y: number;
    targetStyle: string | null;
    targetStyleSteps: number | null;
    fillStyle: string;
  }[] = [];

  constructor(private format: 'full' | 'logo') {
    super();
  }

  buildHexes() {
    const size = (this.size * 1.1) | 0;
    if (this.format === 'full') {
      const topLeft = Hex.pixel_to_pointy_hex({x: 2 * size, y: 2 * size}, size);
      const bottomRight = Hex.pixel_to_pointy_hex(
        {x: this.canvas.width - 2 * size, y: this.canvas.height - 2 * size},
        size
      );
      const topRight = Hex.pixel_to_pointy_hex(
        {x: this.canvas.width - 2 * size, y: 2 * size},
        size
      );

      const bottomLeft = Hex.pixel_to_pointy_hex(
        {x: 2 * size, y: this.canvas.height - size},
        size
      );

      const qMin = Math.min(topLeft.q, bottomRight.q, topRight.q, bottomLeft.q);
      const qMax = Math.max(topLeft.q, bottomRight.q, topRight.q, bottomLeft.q);
      const rMin = Math.min(topLeft.r, bottomRight.r, topRight.r, bottomLeft.r);
      const rMax = Math.max(topLeft.r, bottomRight.r, topRight.r, bottomLeft.r);

      for (let q = qMin; q < qMax; q += 1) {
        for (let r = rMin; r < rMax; r += 1) {
          const s = -(q + r);
          const {x, y} = Hex.qrsToXy({q, r, s}, size);
          if (y > this.canvas.height - size * 0.75 || y < size * 0.75) continue;
          if (x > this.canvas.width - size * 0.75 || x < size * 0.75) continue;

          if (Math.random() < 0.55) {
            this.background.push({
              qrs: {q, r, s},
              x,
              y,
              fillStyle:
                Colors.colors[Math.floor(Math.random() * Colors.colors.length)],
              targetStyle: null,
              targetStyleSteps: null,
            });
          }
        }
      }
    }
    //  else if (this.format === 'logo') {
    // }
  }
  DrawBackground() {
    const size = (this.size * 1.1) | 0;
    if (!this.background.length) {
      this.buildHexes();
    }

    const fadeStep = 33;
    this.ctx.strokeStyle = '#333';
    const resize = 0.85;

    this.background.forEach(h => {
      const rand = Math.random();
      if (h.qrs.q === this.hover?.q && h.qrs.r === this.hover?.r) {
        this.ctx.beginPath();
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#ededed';
        DrawHex.drawHexagonBorder(this.ctx, h.x, h.y, size, resize);
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#aaaaaa';
        this.ctx.stroke();
        this.ctx.closePath();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#333';

        h.targetStyle = h.fillStyle;
        h.fillStyle = '#ededed';
        h.targetStyleSteps = fadeStep;
      } else {
        if (rand < 0.002) {
          if (!h.targetStyle) {
            // generate a number between 0 and 5 for a minute
            const x = ((((new Date().getTime() / 1000) | 0) % 60) / 10) | 0;
            h.targetStyle = Colors.colors[x];
            // h.targetStyle = colors[Math.floor(Math.random() * colors.length)];
            h.targetStyleSteps = fadeStep;
          }
        }

        const maxAlpha = 1.0;
        this.ctx.lineWidth = (this.size / 6) | 0;
        this.ctx.strokeStyle = Colors.colorDark;
        if (h.targetStyle && h.targetStyleSteps) {
          // smooth transition between two colors for fadeStep frames
          this.ctx.beginPath();
          this.ctx.globalAlpha = (maxAlpha * h.targetStyleSteps) / fadeStep;
          this.ctx.fillStyle = h.fillStyle;
          DrawHex.drawHexagonBorder(this.ctx, h.x, h.y, size, resize);
          this.ctx.fill();
          this.ctx.closePath();

          this.ctx.beginPath();
          this.ctx.globalAlpha =
            (maxAlpha * (fadeStep - h.targetStyleSteps)) / fadeStep;
          this.ctx.fillStyle = h.targetStyle;
          DrawHex.drawHexagonBorder(this.ctx, h.x, h.y, size, resize);
          this.ctx.fill();
          this.ctx.closePath();

          h.targetStyleSteps -= 1;

          if (h.targetStyleSteps <= 0) {
            h.fillStyle = h.targetStyle!;
            h.targetStyle = null;
            h.targetStyleSteps = null;
          }
        } else {
          this.ctx.beginPath();
          this.ctx.globalAlpha = maxAlpha;
          this.ctx.fillStyle = h.fillStyle;
          DrawHex.drawHexagonBorder(this.ctx, h.x, h.y, size, resize);
          this.ctx.fill();
          this.ctx.closePath();
        }
      }
    });

    this.ctx.globalAlpha = 1;
  }
}
