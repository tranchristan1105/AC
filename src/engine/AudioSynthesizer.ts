export type SurfaceType = 'grass' | 'sand' | 'wood_bridge' | 'stone_plaza' | 'water';

/**
 * Reverse-Engineered Animal Crossing Audio Engine:
 * 1. Procedural "Animalese" formant speech synthesizer
 * 2. Surface-aware footstep foley generator
 * 3. Adaptive Time-Of-Day (TOD) hourly ambient music loop
 */
export class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private bgmTimer: number | null = null;
  private currentHour = 10;

  // Vowel & consonant formant lookup for Animalese synthesis
  private static readonly CHAR_FORMANTS: Record<string, { f1: number; f2: number; nasal?: boolean }> = {
    a: { f1: 730, f2: 1090 },
    e: { f1: 530, f2: 1840 },
    i: { f1: 270, f2: 2290 },
    o: { f1: 570, f2: 840 },
    u: { f1: 300, f2: 870 },
    m: { f1: 280, f2: 900, nasal: true },
    n: { f1: 320, f2: 1400, nasal: true },
    s: { f1: 900, f2: 2600 },
    t: { f1: 650, f2: 1950 },
    k: { f1: 600, f2: 1600 },
    r: { f1: 480, f2: 1350 },
    l: { f1: 420, f2: 1500 },
    b: { f1: 380, f2: 1100 },
    p: { f1: 440, f2: 1200 },
  };

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    } else if (!muted && this.bgmTimer === null) {
      this.startHourlyBgm(this.currentHour);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Speaks a single character in Animalese.
   * Called sequentially as dialogue letters type onto the screen.
   */
  public speakAnimaleseChar(
    char: string,
    basePitch = 360,
    charIndex = 0,
    isQuestionSentence = false,
    isExclamation = false
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const lower = char.toLowerCase();
    if (!/[a-z0-9]/.test(lower)) return;

    const now = ctx.currentTime;
    const formant = AudioSynthesizer.CHAR_FORMANTS[lower] || {
      f1: 400 + ((lower.charCodeAt(0) * 37) % 450),
      f2: 1100 + ((lower.charCodeAt(0) * 73) % 1100),
    };

    // Inflection curve: slight melodic contour per syllable + rising tail on questions
    const jitter = Math.sin(charIndex * 1.45) * 0.08 + ((lower.charCodeAt(0) % 7) - 3) * 0.025;
    const questionBoost = isQuestionSentence ? 1.12 : isExclamation ? 1.16 : 1.0;
    const freq = basePitch * (1 + jitter) * questionBoost;

    const osc = ctx.createOscillator();
    osc.type = formant.nasal ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.07, now + 0.045);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(formant.f1 * 1.7, now);
    filter.Q.setValueAtTime(3.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.072);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.075);
  }

  /**
   * Surface-aware footstep foley triggered by the player's walk cycle.
   */
  public playFootstep(surface: SurfaceType): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (surface === 'grass') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165 + Math.random() * 25, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.05);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    } else if (surface === 'sand') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240 + Math.random() * 40, now);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.028, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    } else if (surface === 'wood_bridge') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(115, now + 0.06);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    } else {
      // stone_plaza
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340 + Math.random() * 30, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.045);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playSfx(
    type: 'chop' | 'rock' | 'dig' | 'splash' | 'nibble' | 'fanfare' | 'bells' | 'pop' | 'craft'
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'fanfare' || type === 'craft') {
      const notes = type === 'fanfare' ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.085);
        gain.gain.setValueAtTime(0.001, now + idx * 0.085);
        gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.085 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.085 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.085);
        osc.stop(now + idx * 0.085 + 0.3);
      });
      return;
    }

    if (type === 'bells') {
      [987.77, 1318.51].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.08, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.24);
      });
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    switch (type) {
      case 'chop':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        break;
      case 'rock':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.11);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        break;
      case 'dig':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(290, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        break;
      case 'splash':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.14);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        break;
      case 'nibble':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(760, now + 0.07);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        break;
      case 'pop':
      default:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.05);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        break;
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /**
   * Starts a gentle procedural Animal Crossing hourly background melody loop
   * whose scale and tone adapt to morning, afternoon, or night.
   */
  public startHourlyBgm(hour: number): void {
    this.currentHour = hour;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.isMuted) return;

    const isNight = hour >= 19 || hour < 6;
    const scale = isNight
      ? [261.63, 329.63, 392.0, 493.88, 523.25, 659.25] // Cmaj7 dreamy
      : [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25]; // D major sunny

    let step = 0;
    this.bgmTimer = window.setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
      if (Math.random() < 0.28) return; // Breath rests like K.K. / hourly acoustic tracks

      const now = this.ctx.currentTime;
      const freq = scale[(step * 3 + Math.floor(Math.random() * 2)) % scale.length];
      step++;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isNight ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.018, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.9);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.95);
    }, isNight ? 950 : 680);
  }
}
