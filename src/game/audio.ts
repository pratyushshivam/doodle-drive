// Every sound is made on the spot with WebAudio. No files to download.

export class Sound {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private scratch: { gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Browsers only allow sound after a touch or a key. Call this from one. */
  wake() {
    if (this.ac) {
      if (this.ac.state === "suspended") void this.ac.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      this.ac = ac;
      this.master = ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch {
      this.ac = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ac) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ac.currentTime, 0.02);
  }

  private tone(freq: number, to: number, dur: number, vol: number, type: OscillatorType = "sine", delay = 0) {
    const ac = this.ac;
    if (!ac || !this.master) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number) {
    const ac = this.ac;
    if (!ac || !this.master || !this.noise) return;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  pop() {
    this.tone(520, 880, 0.09, 0.16, "triangle");
  }
  tick() {
    this.tone(700, 500, 0.05, 0.1, "triangle");
  }
  undo() {
    this.tone(500, 260, 0.1, 0.12, "triangle");
  }
  go() {
    this.tone(220, 660, 0.22, 0.2, "sawtooth");
    this.tone(330, 990, 0.26, 0.12, "triangle", 0.05);
  }
  thud(power: number) {
    const v = Math.min(0.5, 0.05 + power * 0.03);
    this.tone(130, 45, 0.16, v, "sine");
    this.burst(0.09, v * 0.5, 900);
  }
  star(i: number) {
    this.tone([784, 988, 1319][i] ?? 1319, [784, 988, 1319][i] ?? 1319, 0.3, 0.2, "triangle");
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.22, 0.18, "triangle", i * 0.09));
  }
  flop() {
    this.tone(330, 300, 0.2, 0.16, "sawtooth");
    this.tone(247, 110, 0.5, 0.18, "sawtooth", 0.18);
  }
  splash() {
    this.burst(0.5, 0.3, 1400);
    this.tone(400, 90, 0.4, 0.14, "sine");
  }

  /** The motor: a low buzz that rises with wheel speed. Call every frame. */
  motor(on: boolean, speed: number) {
    const ac = this.ac;
    if (!ac || !this.master) return;
    if (!this.engine) {
      const osc = ac.createOscillator();
      const sub = ac.createOscillator();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();
      osc.type = "sawtooth";
      sub.type = "square";
      filter.type = "lowpass";
      filter.frequency.value = 500;
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      sub.start();
      this.engine = { osc, sub, gain, filter };
    }
    const t = ac.currentTime;
    const f = 48 + Math.min(1, speed / 11) * 95 + (on ? 14 : 0);
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.06);
    this.engine.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    this.engine.filter.frequency.setTargetAtTime(on ? 900 : 380, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(on ? 0.055 : speed > 1 ? 0.018 : 0, t, 0.08);
  }

  motorOff() {
    if (this.engine && this.ac) this.engine.gain.gain.setTargetAtTime(0, this.ac.currentTime, 0.05);
  }

  /** Pencil on paper while a stroke is being drawn. `speed` is 0 to 1. */
  pencil(speed: number) {
    const ac = this.ac;
    if (!ac || !this.master || !this.noise) return;
    if (!this.scratch) {
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2600;
      f.Q.value = 0.7;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.master);
      src.start();
      this.scratch = { gain };
    }
    this.scratch.gain.gain.setTargetAtTime(Math.min(0.07, speed * 0.07), ac.currentTime, 0.03);
  }
}
