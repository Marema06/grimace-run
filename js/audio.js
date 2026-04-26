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

    // Bus dedie a la musique pour pouvoir la couper independamment
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);

    this._startAmbience();
    this._startMusic();
    this.initialized = true;
  }

  // ── MUSIQUE SYNTHWAVE EN BOUCLE (100% synthese, aucun fichier audio) ───────
  _startMusic() {
    if (this._musicStarted) return;
    this._musicStarted = true;

    const BPM = 112;
    const beat = 60 / BPM; // duree d'une noire

    // Progression Am - F - C - G (synthwave classique en La mineur)
    const chords = [
      [220.00, 261.63, 329.63],  // Am
      [174.61, 220.00, 261.63],  // F
      [130.81, 164.81, 196.00],  // C
      [196.00, 246.94, 293.66],  // G
    ];
    const bassNotes = [110.00, 87.31, 65.41, 98.00];

    let bar = 0;
    let nextBarTime = this.ctx.currentTime + 0.2;

    const scheduleBar = () => {
      const chord = chords[bar % 4];
      const bass  = bassNotes[bar % 4];
      const t0    = nextBarTime;

      // BASS : 4 notes par mesure (quarter notes)
      for (let i = 0; i < 4; i++) {
        this._musicBass(bass, t0 + i * beat, beat * 0.9);
      }
      // Octave de bass sur la 1ere et 3eme note
      this._musicBass(bass / 2, t0,             beat * 0.5);
      this._musicBass(bass / 2, t0 + beat * 2,  beat * 0.5);

      // ARPEGGIO : 8 notes par mesure (8th notes)
      for (let i = 0; i < 8; i++) {
        const note = chord[i % chord.length] * 2;
        this._musicArp(note, t0 + i * (beat / 2), beat / 2 * 0.6);
      }

      // KICK sur beats 1 et 3
      this._musicKick(t0);
      this._musicKick(t0 + beat * 2);

      // HIHAT 8 fois par mesure
      for (let i = 0; i < 8; i++) {
        this._musicHihat(t0 + i * (beat / 2), i % 2 === 1 ? 0.018 : 0.010);
      }

      // SNARE sur beats 2 et 4
      this._musicSnare(t0 + beat);
      this._musicSnare(t0 + beat * 3);

      bar++;
      nextBarTime += beat * 4;
    };

    // 4 mesures pre-schedulees
    for (let i = 0; i < 4; i++) scheduleBar();

    // Boucle de scheduling : on garde toujours 1.5s d'avance
    setInterval(() => {
      while (nextBarTime < this.ctx.currentTime + 1.5) scheduleBar();
    }, 250);
  }

  _musicBass(freq, t, dur) {
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    const f   = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f); f.connect(g); g.connect(this.musicBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  _musicArp(freq, t, dur) {
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.musicBus);
    osc.start(t); osc.stop(t + dur + 0.04);
  }

  _musicKick(t) {
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g); g.connect(this.musicBus);
    osc.start(t); osc.stop(t + 0.18);
  }

  _musicHihat(t, vol = 0.014) {
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.04), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t);
  }

  _musicSnare(t) {
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.12), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t);
  }

  setMusicVolume(v) {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  toggleMusic() {
    if (!this.musicBus) return;
    this._musicMuted = !this._musicMuted;
    this.musicBus.gain.setTargetAtTime(this._musicMuted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return !this._musicMuted;
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
