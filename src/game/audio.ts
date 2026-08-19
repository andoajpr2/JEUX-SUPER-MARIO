/* Moteur audio 100% WebAudio : bruitages synthétisés + musique chiptune en boucle. */

type Wave = OscillatorType;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private pattern: number[][] = PATTERNS[0];
  private tempo = 140;
  muted = false;

  /** À appeler sur un geste utilisateur (clic sur JOUER). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(
    freq: number,
    dur: number,
    opts: { type?: Wave; slide?: number; vol?: number; delay?: number; dest?: GainNode | null } = {},
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    g.gain.setValueAtTime(opts.vol ?? 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.25, delay = 0, hp = 0) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = src;
    if (hp > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hp;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  /* ---------------- SFX ---------------- */
  jump(big = false) {
    this.tone(big ? 300 : 250, 0.18, { type: "square", slide: big ? 720 : 620, vol: 0.16 });
  }
  coin() {
    this.tone(988, 0.07, { vol: 0.14 });
    this.tone(1319, 0.22, { delay: 0.06, vol: 0.14 });
  }
  stomp(combo = 1) {
    this.tone(320 - Math.min(combo, 6) * 20, 0.1, { type: "square", slide: 90, vol: 0.2 });
    this.noise(0.06, 0.12);
  }
  kick() {
    this.tone(200, 0.09, { type: "sawtooth", slide: 70, vol: 0.22 });
    this.noise(0.05, 0.1);
  }
  bump() {
    this.tone(120, 0.09, { type: "square", slide: 70, vol: 0.2 });
  }
  brick() {
    this.noise(0.18, 0.28, 0, 400);
    this.tone(180, 0.14, { type: "square", slide: 60, vol: 0.15 });
  }
  powerup() {
    const seq = [392, 494, 587, 784];
    seq.forEach((f, i) => this.tone(f, 0.1, { delay: i * 0.07, vol: 0.15 }));
  }
  star() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.09, { type: "triangle", delay: i * 0.06, vol: 0.16 }));
  }
  oneUp() {
    const seq = [330, 392, 659, 523, 587, 784];
    seq.forEach((f, i) => this.tone(f, 0.09, { delay: i * 0.06, vol: 0.14 }));
  }
  dash() {
    this.noise(0.16, 0.16, 0, 900);
    this.tone(500, 0.16, { type: "sawtooth", slide: 1200, vol: 0.1 });
  }
  hurt() {
    this.tone(400, 0.24, { type: "square", slide: 110, vol: 0.2 });
  }
  death() {
    const seq = [494, 466, 440, 392, 330, 262, 196];
    seq.forEach((f, i) => this.tone(f, 0.12, { delay: i * 0.09, vol: 0.16 }));
  }
  checkpoint() {
    const seq = [523, 659, 784];
    seq.forEach((f, i) => this.tone(f, 0.1, { delay: i * 0.08, vol: 0.15 }));
  }
  flag() {
    const seq = [392, 523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.11, { delay: i * 0.09, vol: 0.15 }));
  }
  bossHit() {
    this.tone(140, 0.22, { type: "sawtooth", slide: 50, vol: 0.3 });
    this.noise(0.2, 0.25, 0, 200);
  }
  bossDie() {
    for (let i = 0; i < 6; i++) this.noise(0.22, 0.3, i * 0.12, 150);
    const seq = [262, 330, 392, 523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.14, { type: "triangle", delay: 0.7 + i * 0.1, vol: 0.18 }));
  }
  select() {
    this.tone(660, 0.06, { vol: 0.12 });
    this.tone(880, 0.09, { delay: 0.05, vol: 0.12 });
  }
  tick() {
    this.tone(1200, 0.03, { vol: 0.08 });
  }

  /* ---------------- Musique ---------------- */
  startMusic(patternIdx: number, tempo = 140) {
    if (!this.ctx || !this.musicGain) return;
    this.stopMusic();
    this.pattern = PATTERNS[patternIdx % PATTERNS.length];
    this.tempo = tempo;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private schedule() {
    if (!this.ctx || !this.musicGain) return;
    const stepDur = 60 / this.tempo / 2; // croches
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      const s = this.step % 16;
      const mel = this.pattern[0][s];
      const bass = this.pattern[1][s];
      if (mel >= 0) this.musicNote(midiToFreq(mel), stepDur * 0.9, "square", 0.5, this.nextTime);
      if (bass >= 0) this.musicNote(midiToFreq(bass), stepDur * 0.95, "triangle", 0.9, this.nextTime);
      if (s % 4 === 2) this.hat(this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private musicNote(freq: number, dur: number, type: Wave, vol: number, when: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol * 0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private hat(when: number) {
    if (!this.ctx || !this.musicGain) return;
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(when);
  }
}

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/* Patterns [mélodie, basse] — 16 pas, valeurs MIDI, -1 = silence */
const P1_MELODY = [76, -1, 79, -1, 81, -1, 79, -1, 76, -1, 72, -1, 74, 76, 74, -1];
const P1_BASS = [48, -1, 55, -1, 53, -1, 55, -1, 45, -1, 52, -1, 43, -1, 47, -1];
const P2_MELODY = [69, -1, 72, -1, 76, -1, 72, -1, 74, -1, 77, -1, 81, -1, 79, 77];
const P2_BASS = [45, -1, 52, -1, 48, -1, 55, -1, 43, -1, 50, -1, 41, -1, 48, -1];
const P3_MELODY = [64, -1, -1, 67, -1, 64, -1, -1, 71, -1, -1, 69, -1, 67, -1, 62];
const P3_BASS = [40, -1, 40, -1, 43, -1, 43, -1, 38, -1, 38, -1, 36, -1, 36, -1];
const P4_MELODY = [67, 67, -1, 67, -1, 63, 67, -1, 70, -1, -1, 69, -1, 67, 70, 72];
const P4_BASS = [36, -1, 43, -1, 36, -1, 43, -1, 34, -1, 41, -1, 31, -1, 38, -1];
const P5_MELODY = [71, -1, 74, 78, -1, 74, 71, -1, 76, -1, 79, 83, -1, 81, 79, 78];
const P5_BASS = [42, -1, 49, -1, 45, -1, 52, -1, 40, -1, 47, -1, 43, -1, 50, -1];

const PATTERNS: number[][][] = [
  [P1_MELODY, P1_BASS],
  [P2_MELODY, P2_BASS],
  [P3_MELODY, P3_BASS],
  [P4_MELODY, P4_BASS],
  [P5_MELODY, P5_BASS],
];
