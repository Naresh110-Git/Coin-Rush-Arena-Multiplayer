/**
 * Web Audio API Procedural Synthesizer for Coin Rush Arena
 * Zero external audio files required — 100% reliable across cellular and offline networks.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private musicActive: boolean = false;
  private musicInterval: number | null = null;
  private musicStep: number = 0;

  // Driving arcade bassline (A minor progression: A2, C3, D3, E3, G2)
  private static BASS_NOTES = [110, 110, 130.81, 146.83, 110, 164.81, 146.83, 98.0];

  constructor() {
    const saved = localStorage.getItem('coin_rush_muted');
    if (saved === 'true') {
      this.muted = true;
    }
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public unlockAudio(): void {
    this.initContext();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('coin_rush_muted', String(this.muted));
    if (this.muted) {
      this.stopMusic();
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startMusic(): void {
    if (this.muted || this.musicActive) return;
    this.initContext();
    if (!this.ctx) return;

    this.musicActive = true;
    this.musicStep = 0;

    // 135 BPM arcade pace (~222ms per eighth note)
    const stepDurationMs = 222;
    this.musicInterval = window.setInterval(() => {
      if (!this.musicActive || this.muted) return;
      this.playSynthBassStep();
      this.musicStep = (this.musicStep + 1) % SoundManager.BASS_NOTES.length;
    }, stepDurationMs);
  }

  public stopMusic(): void {
    this.musicActive = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  private playSynthBassStep(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const freq = SoundManager.BASS_NOTES[this.musicStep] || 110;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCoinPickup(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Classic high coin ding: 987Hz (B5) up to 1318Hz (E6)
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playGoldenCoin(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Rich dual-tone golden chime (E6 + B6)
    [1318.51, 1975.53].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.25);

      gain.gain.setValueAtTime(0.15, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.04);
      osc.stop(now + 0.3);
    });
  }

  public playCountdownPip(isFinal: boolean = false): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = isFinal ? 1200 : 700;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.35 : 0.12));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isFinal ? 0.38 : 0.15));
  }

  public playRushHour(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.4);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.48);
  }

  public playMatchEnd(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Triumphant victory triad: C5 (523Hz), E5 (659Hz), G5 (784Hz)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.15, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + 0.65);
    });
  }
}
