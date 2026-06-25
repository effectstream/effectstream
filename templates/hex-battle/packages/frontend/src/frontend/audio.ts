export enum AudioType {
  click = '/assets/click.wav',
  turn = '/assets/turn.wav',
}

export class HexAudio {
  static audioCtx: AudioContext;
  static buffer: Record<string, AudioBuffer | null> = {};

  constructor() {
    try {
      if (!HexAudio.audioCtx) {
        HexAudio.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.log('HexAudio', e);
    }
  }

  private loadAudio(audio: AudioType): Promise<AudioType> {
    return new Promise((resolve, reject) => {
      if (!HexAudio.audioCtx) {
        return reject('No AudioContext Cannot load audio');
      }

      const request = new XMLHttpRequest();
      request.open('GET', audio);
      request.responseType = 'arraybuffer';
      request.onload = () => {
        const undecodedAudio = request.response;
        HexAudio.audioCtx.decodeAudioData(undecodedAudio, data => {
          HexAudio.buffer[audio] = data;
          resolve(audio);
        });
      };
      request.send();
    });
  }

  async load(): Promise<AudioType[]> {
    return Promise.all([
      this.loadAudio(AudioType.click),
      this.loadAudio(AudioType.turn),
    ]);
  }

  play(audio: AudioType) {
    try {
      const source = HexAudio.audioCtx.createBufferSource();
      source.buffer = HexAudio.buffer[audio];
      source.connect(HexAudio.audioCtx.destination);
      source.start();
    } catch (e) {
      console.log('HexAudio', e);
    }
  }
}
