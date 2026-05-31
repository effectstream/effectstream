import {ImageCache} from './load_screen';
import {ScreenUI} from './screen';

export class StartupScreen extends ScreenUI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drawTimer: any;

  // first stage is to load the logo
  // second stage is to fade out
  private stageCounter = [50, 20];

  private logoSize = [400, 286, (300 * 0.6) | 0, (81 * 0.6) | 0];
  private alpha = 0;
  private imageCache = new ImageCache(null as any);
  readonly paimaLogo = '/assets/paima.png';
  readonly algorandLogo = '/assets/algorand.png';

  ready = false;
  constructor(public finishCallback: () => void) {
    super();
    const src = 'assets/hexlands.png';
    this.imageCache.preloadImage(src).then(() => {
      this.ready = true;
    });
  }

  async start(): Promise<void> {
    this.setIsLoading(true);
    this.imageCache.preloadImage(this.paimaLogo);
    this.imageCache.preloadImage(this.algorandLogo);
    this.drawTimer = setInterval(() => this.DrawUI(), 33);
    return;
  }

  async stop(): Promise<void> {
    clearInterval(this.drawTimer);
    return;
  }

  selfStop() {
    if (this.stageCounter[0] === 0 && this.stageCounter[1] === 0) {
      if (this.ready) {
        this.stop();
        this.finishCallback();
      } // wait logo to load
      return;
    }

    if (this.stageCounter[0] > 0) {
      if (ImageCache.images.has(this.paimaLogo)) {
        this.stageCounter[0] -= 1;
        if (this.alpha < 1) {
          this.alpha += 0.05;
          this.alpha = Math.min(1, this.alpha);
        }
      }
      return;
    }

    if (this.stageCounter[1] > 0) {
      this.stageCounter[1] -= 1;
      if (this.alpha > 0) {
        this.alpha -= 0.1;
        this.alpha = Math.max(0, this.alpha);
      }
      return;
    }
  }

  DrawUI() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.stageCounter[0] === 0) this.ctx.globalAlpha = this.alpha;
    this.ctx.fillStyle = '#19B17B';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.DrawLogo();
    this.DrawLogo2();
    // this.DrawLoading();
    this.selfStop();
  }

  DrawLogo2() {
    if (ImageCache.images.has(this.algorandLogo)) {
      this.ctx.globalAlpha = this.alpha;
      this.ctx.drawImage(
        ImageCache.images.get(this.algorandLogo),
        this.canvas.width / 2 - this.logoSize[2] / 2,
        this.canvas.height - this.logoSize[3] - 10,
        this.logoSize[2],
        this.logoSize[3]
      );
      this.ctx.font = '16px Electrolize';
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        'Powered by',
        this.canvas.width / 2,
        this.canvas.height - this.logoSize[3] - 20
      );
      this.ctx.globalAlpha = 1;
    }
  }

  DrawLogo() {
    if (ImageCache.images.has(this.paimaLogo)) {
      this.ctx.globalAlpha = this.alpha;
      this.ctx.drawImage(
        ImageCache.images.get(this.paimaLogo),
        this.canvas.width / 2 - this.logoSize[0] / 2,
        this.canvas.height / 2 - this.logoSize[1] / 2,
        this.logoSize[0],
        this.logoSize[1]
      );
      this.ctx.globalAlpha = 1;
    }
  }
}
