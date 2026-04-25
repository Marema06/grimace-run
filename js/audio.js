'use strict';

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.initialized = false;
    this.enabled = true;
  }

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.ctx.destination);
    this._startAmbience();
    this.initialized = true;
  }

  _startAmbience() {
    for (const det of [-3, 3]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 55 + det;
      const g = this.ctx.createGain();
      g.gain.value = 0.03;
      osc.connect(g); g.connect(this.master);
      osc.start();
    }
  }

  _tone(freq1, freq2, dur, type = 'sine', vol = 0.12) {
    if (!this.enabled || !this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq1, t);
    osc.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  _noise(dur, filterFreq = 800, vol = 0.2) {
    if (!this.enabled || !this.initialized) return;
    const t   = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  jump()      { this._tone(500, 1100, 0.08, 'sine', 0.1); }
  superJump() { this._tone(350, 1400, 0.15, 'triangle', 0.13); }
  dash()      { this._noise(0.1, 2000, 0.15); }
  shield()    { this._tone(880, 880, 0.2, 'sine', 0.08); this._tone(1100, 1100, 0.2, 'sine', 0.06); }
  hit()       { this._noise(0.18, 600, 0.25); this._tone(300, 80, 0.2, 'sawtooth', 0.1); }
  death()     { this._tone(440, 110, 0.5, 'sawtooth', 0.15); }

  playEvolution(gen) {
    if (!this.enabled || !this.initialized) return;
    const root = 220 * Math.pow(2, (gen % 12) / 12);
    [1, 1.25, 1.5, 2].forEach((r, i) => {
      const t = this.ctx.currentTime + i * 0.09;
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = root * r;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.42);
    });
  }

  setVolume(v) {
    if (!this.initialized) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
}
