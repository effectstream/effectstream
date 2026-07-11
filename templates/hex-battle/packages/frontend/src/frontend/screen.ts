import {DrawHex} from './hex.draw';

export abstract class ScreenUI {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  private toastMessage = '';
  private toastPercent = 0;
  private isLoading = false;
  private isLoadingRotation = 0;
  setIsLoading(isLoading: boolean) {
    this.isLoading = isLoading;
  }
  getIsLoading() {
    return this.isLoading;
  }

  DrawLoading() {
    if (!this.isLoading) return;

    this.isLoadingRotation += (2 * Math.PI) / 100;
    this.isLoadingRotation %= 2 * Math.PI;
    this.ctx.globalAlpha = 0.7;

    this.ctx.beginPath();
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = 'white';
    DrawHex.drawHexagon(
      this.ctx,
      this.canvas.width - 40,
      this.canvas.height - 45,
      25 - 5 * Math.sin(this.isLoadingRotation),
      this.isLoadingRotation
    );
    this.ctx.fill();
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.fillStyle = 'black';
    this.ctx.strokeStyle = 'black';
    DrawHex.drawHexagon(
      this.ctx,
      this.canvas.width - 40,
      this.canvas.height - 45,
      20 + 10 * Math.sin(this.isLoadingRotation),
      -this.isLoadingRotation
    );
    this.ctx.closePath();
    this.ctx.globalAlpha = 1;

    // TODO MOVE TO MAP.
    this.ctx.strokeStyle = 'black';
  }

  setToastMessage(message: string) {
    this.toastMessage = message;
    this.toastPercent = 100;
  }

  protected DrawToast = () => {
    if (!this.toastMessage) {
      return;
    }

    this.toastPercent -= 1;
    if (this.toastPercent <= 0) {
      this.toastMessage = '';
    }

    const boxW = 400;
    const boxH = 50;
    this.ctx.beginPath();
    this.ctx.fillStyle = 'white';
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 1;
    this.ctx.roundRect(
      this.canvas.width / 2 - boxW / 2,
      this.canvas.height - 10 - boxH,
      boxW,
      boxH,
      2
    );
    this.ctx.stroke();
    this.ctx.fill();
    this.ctx.closePath();

    // progress bar
    this.ctx.beginPath();
    this.ctx.globalAlpha = 0.7;
    this.ctx.fillStyle = '#2ecc71';
    this.ctx.roundRect(
      this.canvas.width / 2 - boxW / 2,
      this.canvas.height - 14,
      boxW * (this.toastPercent / 100),
      4,
      4
    );
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.font = '20px Electrolize';
    this.ctx.fillStyle = 'black';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      this.toastMessage,
      this.canvas.width / 2,
      this.canvas.height - boxH / 2 - 5,
      boxW - 10
    );
    this.ctx.closePath();
  };

  // abstract DrawUI(): void;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}
