import type { EngineTone, HornTone } from './vehicles';

export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  eng1!: OscillatorNode;
  eng2!: OscillatorNode;
  engSub!: OscillatorNode;
  turboOsc!: OscillatorNode;
  turboGain!: GainNode;
  engGain!: GainNode;
  filt!: BiquadFilterNode;
  hornOsc: OscillatorNode[] = [];
  hornGain!: GainNode;
  enabled = true;
  currentHornTone: HornTone = 'car';

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.65;
      this.master.connect(c.destination);

      // Engine multi-oscillator chain
      this.filt = c.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = 650;
      this.filt.Q.value = 3.2;

      this.engGain = c.createGain();
      this.engGain.gain.value = 0;
      this.filt.connect(this.engGain);
      this.engGain.connect(this.master);

      this.eng1 = c.createOscillator();
      this.eng1.type = 'sawtooth';
      this.eng2 = c.createOscillator();
      this.eng2.type = 'square';
      this.engSub = c.createOscillator();
      this.engSub.type = 'triangle';

      const g2 = c.createGain();
      g2.gain.value = 0.38;
      const gSub = c.createGain();
      gSub.gain.value = 0.45;

      this.eng1.connect(this.filt);
      this.eng2.connect(g2);
      g2.connect(this.filt);
      this.engSub.connect(gSub);
      gSub.connect(this.filt);

      // Turbocharger whistle for diesel trucks/buses/matatus
      this.turboOsc = c.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 1400;
      this.turboGain = c.createGain();
      this.turboGain.gain.value = 0;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.master);

      this.eng1.start();
      this.eng2.start();
      this.engSub.start();
      this.turboOsc.start();

      // Dual-tone Horn chain
      this.hornGain = c.createGain();
      this.hornGain.gain.value = 0;
      this.hornGain.connect(this.master);
      const hf = c.createBiquadFilter();
      hf.type = 'lowpass';
      hf.frequency.value = 2200;
      hf.connect(this.hornGain);
      for (const f of [415, 520]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(hf);
        o.start();
        this.hornOsc.push(o);
      }
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  engine(rpm: number, throttle: number, on: boolean, tone: EngineTone = 'saloon') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const mult =
      tone === 'moped' ? 1.55 :
      tone === 'moto' ? 1.35 :
      tone === 'tuktuk' ? 1.15 :
      tone === 'saloon' ? 0.95 :
      tone === 'matatu' ? 0.88 :
      tone === 'truck' ? 0.65 :
      tone === 'bus' ? 0.58 :
      tone === 'heavy' ? 0.50 :
      0.52; // plant

    const base = Math.max(18, (rpm / 60) * mult);
    this.eng1.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    this.eng2.frequency.setTargetAtTime(base * (tone === 'tuktuk' || tone === 'moped' ? 0.5 : 0.25), t, 0.04);
    this.engSub.frequency.setTargetAtTime(Math.max(16, base * 0.125), t, 0.05);

    const cutoff = 260 + rpm * 0.24 + throttle * 720;
    this.filt.frequency.setTargetAtTime(cutoff, t, 0.06);

    const vol = on && this.enabled ? 0.085 + throttle * 0.075 : 0;
    this.engGain.gain.setTargetAtTime(vol, t, 0.08);

    // Turbo whistle on trucks, buses, matatus
    const hasTurbo = tone === 'truck' || tone === 'heavy' || tone === 'bus' || tone === 'matatu';
    const turboVol = on && this.enabled && hasTurbo && rpm > 1100 ? Math.min(0.035, (rpm - 1100) / 90000 * (0.3 + throttle)) : 0;
    this.turboOsc.frequency.setTargetAtTime(1100 + rpm * 0.55, t, 0.08);
    this.turboGain.gain.setTargetAtTime(turboVol, t, 0.08);
  }

  horn(on: boolean, tone: HornTone = 'car') {
    if (on && !this.ctx) this.init();
    if (!this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    if (this.hornOsc.length >= 2) {
      const freqs: [number, number] =
        tone === 'beep' ? [660, 830] :
        tone === 'airhorn' ? [185, 233] :
        [415, 520];
      this.hornOsc[0].frequency.setTargetAtTime(freqs[0], t, 0.01);
      this.hornOsc[1].frequency.setTargetAtTime(freqs[1], t, 0.01);
    }
    this.hornGain.gain.setTargetAtTime(on && this.enabled ? 0.26 : 0, t, 0.015);
  }

  beep(freq: number, dur = 0.08, vol = 0.14, type: OscillatorType = 'sine') {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.setTargetAtTime(0.0001, c.currentTime + dur * 0.65, dur * 0.25);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(c.currentTime + dur * 2.2);
  }

  /** Mechanical indicator relay tick-tock */
  tick(high: boolean) {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    // Short percussive click
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(high ? 2100 : 1450, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(high ? 620 : 440, c.currentTime + 0.018);
    g.gain.setValueAtTime(0.16, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.022);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(c.currentTime + 0.026);
  }

  /** Electronic dashboard switch click */
  switchClick(on = true) {
    this.beep(on ? 1550 : 1120, 0.025, 0.11, 'square');
  }

  /** Mechanical H-shifter / sequential gear engagement sound */
  gearShift() {
    this.beep(190, 0.045, 0.14, 'triangle');
    setTimeout(() => this.beep(280, 0.03, 0.09, 'sine'), 28);
  }

  /** Gear grind when shifting manual without pressing clutch */
  gearGrind() {
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.beep(240 + (i % 2) * 95, 0.05, 0.18, 'sawtooth'), i * 42);
    }
  }

  /** Engine starter crank + ignition roar */
  starterCrank(starting: boolean) {
    if (!this.ctx || !this.enabled) return;
    if (starting) {
      this.beep(140, 0.09, 0.15, 'sawtooth');
      setTimeout(() => this.beep(155, 0.09, 0.15, 'sawtooth'), 100);
      setTimeout(() => this.beep(230, 0.18, 0.18, 'triangle'), 200);
    } else {
      this.beep(180, 0.12, 0.12, 'sine');
    }
  }

  /** Engine stall shudder */
  stallSound() {
    if (!this.ctx || !this.enabled) return;
    [170, 130, 95, 65].forEach((f, i) => setTimeout(() => this.beep(f, 0.09, 0.2, 'sawtooth'), i * 65));
  }

  /** Pneumatic air-brake hiss for trucks & buses */
  airBrakeHiss() {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 0.22);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    const g = c.createGain();
    g.gain.value = 0.18;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
  }

  wiperSwoosh() {
    this.beep(260, 0.07, 0.04, 'sine');
  }

  fault(sev: string) {
    if (sev === 'fail') {
      this.beep(220, 0.35, 0.22, 'sawtooth');
      setTimeout(() => this.beep(160, 0.45, 0.22, 'sawtooth'), 200);
    } else if (sev === 'major') {
      this.beep(330, 0.25, 0.18, 'triangle');
    } else {
      this.beep(600, 0.12, 0.12, 'triangle');
    }
  }

  chime() {
    this.beep(880, 0.12, 0.12);
    setTimeout(() => this.beep(1320, 0.18, 0.12), 120);
  }

  success() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.2, 0.14), i * 130));
  }

  crash() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 0.4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.5;
    s.connect(g);
    g.connect(this.master);
    s.start();
  }

  stopAll() {
    if (this.ctx) {
      this.engGain.gain.value = 0;
      this.turboGain.gain.value = 0;
      this.hornGain.gain.value = 0;
    }
  }
}
