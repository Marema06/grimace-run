'use strict';

class FaceMeshController {
  constructor() {
    this.active   = false;
    this.faces    = [];
    this.facemesh = null;
    this.stream   = null;

    // Gestes (noms compatibles sketch.js)
    this.mouthOpen     = false;
    this.mouthWide     = false;
    this.eyebrowRaised = false;
    this.smiling       = false;

    // Valeurs brutes
    this.mouthRatio  = 0;
    this.browRatio   = 0;
    this.smileRatio  = 0;

    // Calibration dynamique : mesure les 90 premieres frames au repos
    this._calibFrames  = 0;
    this._baselineMouth = -1;   // -1 = pas encore calibre
    this._baselineBrow  = -1;
    this._baselineSmile = -1;
    this._calibDone     = false;

    this.videoEl    = document.getElementById('webcam');
    this.overlayEl  = document.getElementById('pose-canvas');
    this.overlayCtx = this.overlayEl.getContext('2d');
    this.statusEl   = document.getElementById('face-status');
    this.btn        = document.getElementById('btn-facemesh');
    this.btnStop    = document.getElementById('btn-stop-cam');

    this.btn?.addEventListener('click', () => {
      if (!this.active) this._activate();
    });
    this.btnStop?.addEventListener('click', () => {
      this._userStopped = true;
      this._deactivate();
    });

    // WATCHDOG : si la camera disparait alors qu'elle devrait etre active,
    // on la remet en place automatiquement chaque seconde
    setInterval(() => this._watchdog(), 1000);
    this._userStopped = false;
  }

  async _activate() {
    // Desactive ET retire le focus immediatement
    // pour que ESPACE ne puisse jamais re-cliquer ce bouton
    this.btn.disabled = true;
    this.btn.blur();
    document.querySelector('#canvas-container canvas')?.focus();

    try {
      this.statusEl.textContent = 'Connexion webcam...';

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      });

      this.videoEl.srcObject = this.stream;
      document.getElementById('webcam-wrapper').classList.add('visible');
      await this.videoEl.play();

      this.overlayEl.width  = this.videoEl.videoWidth  || 320;
      this.overlayEl.height = this.videoEl.videoHeight || 240;

      this.statusEl.textContent = 'Chargement FaceMesh...';

      this.facemesh = ml5.faceMesh({ maxFaces: 1, flipped: true });
      this.facemesh.detectStart(this.videoEl, (results) => {
        try {
          this.faces = results;
          this._process();
          this._drawOverlay();
        } catch (err) {
          // Absorbe les erreurs de traitement - ne coupe jamais la camera
          console.warn('[FaceMesh callback]', err.message);
        }
      });

      this.active = true;
      this._calibFrames  = 0;
      this._calibDone    = false;
      this._baselineMouth = -1;
      this._baselineBrow  = -1;
      this._baselineSmile = -1;

      this.btn.textContent = 'CAMERA ON';
      this.btn.classList.add('btn-active');
      this.btn.disabled = false; // re-enable mais ne fait plus rien si on clique
      this.statusEl.textContent = 'Restez neutre 3s pour calibrer...';

    } catch (e) {
      console.error('[FaceMesh activate]', e);
      this.stream?.getTracks().forEach(t => t.stop());
      this.stream = null;
      document.getElementById('webcam-wrapper').classList.remove('visible');

      this.btn.disabled = false;
      this.btn.textContent = 'ACTIVER VISAGE';

      if (e.name === 'NotAllowedError')
        this.statusEl.textContent = 'Permission refusee - clique le cadenas dans Chrome';
      else if (e.name === 'NotReadableError' || e.name === 'AbortError')
        this.statusEl.textContent = 'Camera occupee - ferme Zoom/Teams/Discord';
      else
        this.statusEl.textContent = 'Erreur : ' + (e.message || e.name);
    }
  }

  // Verifie chaque seconde que la camera est dans l'etat attendu
  _watchdog() {
    // Si l'utilisateur a explicitement arrete : on laisse tranquille
    if (this._userStopped) return;
    // Si la camera n'est pas encore active : on ne fait rien (auto-start s'en occupe)
    if (!this.active) return;

    // Si le wrapper a perdu sa visibilite -> on la remet
    const wrapper = document.getElementById('webcam-wrapper');
    if (wrapper && !wrapper.classList.contains('visible')) {
      wrapper.classList.add('visible');
    }

    // Si le stream a ete coupe -> on relance tout
    const tracks = this.stream?.getVideoTracks() || [];
    if (!tracks.length || tracks[0].readyState !== 'live') {
      console.warn('[Watchdog] Stream perdu, redemarrage...');
      this.active = false;
      this._activate();
    }
  }

  _deactivate() {
    try { this.facemesh?.detectStop(); } catch (_) {}
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.videoEl.srcObject = null;
    document.getElementById('webcam-wrapper').classList.remove('visible');

    this.active = false;
    this.mouthOpen = this.mouthWide = this.eyebrowRaised = this.smiling = false;
    this.mouthRatio = this.browRatio = this.smileRatio = 0;
    this._calibDone = false;

    this.btn.disabled    = false;
    this.btn.textContent = 'ACTIVER VISAGE';
    this.btn.classList.remove('btn-active');
    this.statusEl.textContent = 'Camera desactivee';
    document.querySelector('#canvas-container canvas')?.focus();
  }

  _process() {
    if (!this.faces?.length) {
      this.mouthOpen = this.mouthWide = this.eyebrowRaised = this.smiling = false;
      this.mouthRatio = this.browRatio = this.smileRatio = 0;
      return;
    }

    const kps = this.faces[0].keypoints;
    if (!kps || kps.length < 400) return;

    // Reference : hauteur visage (front -> menton), plus stable que largeur yeux
    // 10 = front haut, 152 = menton
    const forehead = kps[10], chin = kps[152];
    const faceH = Math.max(Math.abs(chin.y - forehead.y), 40);

    // Bouche : landmarks 13 (levre sup) et 14 (levre inf)
    this.mouthRatio = Math.abs(kps[14].y - kps[13].y) / faceH;

    // Sourcils : distance sourcil - bord oeil (normalise par hauteur visage)
    const lR = (kps[159].y - kps[105].y) / faceH;
    const rR = (kps[386].y - kps[334].y) / faceH;
    this.browRatio = (lR + rR) / 2;

    // Sourire : largeur bouche / hauteur visage
    this.smileRatio = Math.abs(kps[291].x - kps[61].x) / faceH;

    // ── Calibration automatique (90 premieres frames = ~3s) ─────────────────
    if (!this._calibDone) {
      this._calibFrames++;

      if (this._baselineMouth < 0) {
        this._baselineMouth = this.mouthRatio;
        this._baselineBrow  = this.browRatio;
        this._baselineSmile = this.smileRatio;
      } else {
        // Moyenne glissante
        const a = 0.95;
        this._baselineMouth = a * this._baselineMouth + (1-a) * this.mouthRatio;
        this._baselineBrow  = a * this._baselineBrow  + (1-a) * this.browRatio;
        this._baselineSmile = a * this._baselineSmile + (1-a) * this.smileRatio;
      }

      if (this._calibFrames >= 90) {
        this._calibDone = true;
        this.statusEl.textContent = 'Calibre ! Faites vos grimaces !';
      } else {
        const s = Math.ceil((90 - this._calibFrames) / 30);
        this.statusEl.textContent = `Calibration... ${s}s (restez neutre)`;
      }
    }

    // ── Detection : seuil = baseline + delta fixe ────────────────────────────
    const bm = this._calibDone ? this._baselineMouth : 0;
    const bb = this._calibDone ? this._baselineBrow  : 0;
    const bs = this._calibDone ? this._baselineSmile : 0;

    this.mouthOpen     = this.mouthRatio  > bm + 0.04;
    this.mouthWide     = this.mouthRatio  > bm + 0.10;
    this.eyebrowRaised = this.browRatio   > bb + 0.06;
    this.smiling       = this.smileRatio  > bs + 0.08 && !this.mouthOpen;
  }

  _drawOverlay() {
    const ctx = this.overlayCtx;
    const W = this.overlayEl.width, H = this.overlayEl.height;
    ctx.clearRect(0, 0, W, H);

    if (!this.faces?.length) {
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('Aucun visage', 4, 14);
      return;
    }

    const kps = this.faces[0].keypoints;

    // Mesh complet (discret)
    ctx.fillStyle = 'rgba(0,255,200,0.15)';
    for (const kp of kps) {
      ctx.beginPath(); ctx.arc(kp.x, kp.y, 1, 0, Math.PI * 2); ctx.fill();
    }

    // Points bouche
    const mc = this.mouthWide ? '#ff2288' : this.mouthOpen ? '#ffdd00' : '#00ccaa';
    ctx.fillStyle = mc; ctx.shadowBlur = 8; ctx.shadowColor = mc;
    for (const i of [13, 14, 61, 291]) {
      if (!kps[i]) continue;
      ctx.beginPath(); ctx.arc(kps[i].x, kps[i].y, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (kps[13] && kps[14]) {
      ctx.strokeStyle = mc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(kps[13].x, kps[13].y);
      ctx.lineTo(kps[14].x, kps[14].y); ctx.stroke();
    }

    // Points sourcils
    const bc = this.eyebrowRaised ? '#ff8800' : '#666';
    ctx.fillStyle = bc; ctx.shadowColor = bc;
    for (const i of [105, 334]) {
      if (!kps[i]) continue;
      ctx.beginPath(); ctx.arc(kps[i].x, kps[i].y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Barres valeurs vs baseline
    const bm = this._calibDone ? this._baselineMouth : 0;
    const bb = this._calibDone ? this._baselineBrow  : 0;
    const bs = this._calibDone ? this._baselineSmile : 0;

    this._drawBar(ctx, 2, 2,  W-4, 11, this.mouthRatio,  bm, bm+0.04, bm+0.10, '#ffdd00', 'BOUCHE');
    this._drawBar(ctx, 2, 15, W-4, 11, this.browRatio,   bb, bb+0.06, bb+0.12, '#ff8800', 'BROW');
    this._drawBar(ctx, 2, 28, W-4, 11, this.smileRatio,  bs, bs+0.08, bs+0.16, '#44ff88', 'SMILE');

    // Geste detecte
    const labels = [];
    if (this.mouthWide)      labels.push({ t: '>> SUPER SAUT', c: '#ff2288' });
    else if (this.mouthOpen) labels.push({ t: '>> SAUT',       c: '#ffdd00' });
    if (this.eyebrowRaised)  labels.push({ t: '>> DASH',       c: '#ff8800' });
    if (this.smiling)        labels.push({ t: '>> BOUCLIER',   c: '#44ff88' });

    ctx.font = 'bold 13px monospace';
    labels.forEach(({ t, c }, i) => {
      ctx.fillStyle = c; ctx.shadowBlur = 8; ctx.shadowColor = c;
      ctx.fillText(t, 4, H - 8 - i * 18);
    });
    ctx.shadowBlur = 0;

    // Statut calibration
    if (!this._calibDone) {
      ctx.fillStyle = 'rgba(255,220,0,0.9)';
      ctx.font = 'bold 10px monospace';
      const pct = Math.floor(this._calibFrames / 90 * 100);
      ctx.fillText(`Calibration ${pct}%`, 4, H - 8);
    }
  }

  _drawBar(ctx, x, y, w, h, value, base, t1, t2, color, label) {
    const maxVal = Math.max(t2 * 2, 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, h);
    const filled = Math.min(value / maxVal, 1) * w;
    ctx.fillStyle = value >= t2 ? '#ff2288' : value >= t1 ? color : 'rgba(70,70,70,0.6)';
    ctx.fillRect(x, y, filled, h);
    // Ligne baseline
    if (base > 0) {
      const bx = x + (base / maxVal) * w;
      ctx.strokeStyle = 'rgba(0,255,200,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y+h); ctx.stroke();
    }
    // Seuils
    [t1, t2].forEach(t => {
      const tx = x + (t / maxVal) * w;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y+h); ctx.stroke();
    });
    ctx.fillStyle = '#fff'; ctx.font = '7px monospace';
    ctx.fillText(`${label}:${value.toFixed(3)}`, x+2, y+h-1);
  }
}
