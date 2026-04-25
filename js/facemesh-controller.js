'use strict';

/**
 * Controleur ML5.js FaceMesh - VERSION SIMPLE ET ROBUSTE
 * Pas de watchdog, pas de calibration, pas de desactivation possible.
 * Une fois active, reste active jusqu'a la fermeture de la page.
 */
class FaceMeshController {
  constructor() {
    this.active   = false;
    this.faces    = [];
    this.facemesh = null;
    this.stream   = null;
    this._activating = false;

    // Gestes
    this.mouthOpen     = false;
    this.mouthWide     = false;
    this.eyebrowRaised = false;
    this.smiling       = false;

    // Valeurs brutes
    this.mouthRatio  = 0;
    this.browRatio   = 0;
    this.smileRatio  = 0;

    this.videoEl    = document.getElementById('webcam');
    this.overlayEl  = document.getElementById('pose-canvas');
    this.overlayCtx = this.overlayEl.getContext('2d');
    this.statusEl   = document.getElementById('face-status');
    this.btn        = document.getElementById('btn-facemesh');

    // Le bouton ACTIVE seulement, jamais ne desactive
    this.btn?.addEventListener('click', () => this._activate());
  }

  // _activate est IDEMPOTENT : ne fait rien si deja actif ou en cours d'activation
  async _activate() {
    if (this.active || this._activating) return;
    this._activating = true;

    try {
      this.statusEl.textContent = 'Connexion webcam...';

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      const W = this.videoEl.videoWidth  || 640;
      const H = this.videoEl.videoHeight || 480;

      this.overlayEl.width  = W;
      this.overlayEl.height = H;

      // Canvas de pre-traitement : booste luminosite + contraste
      // pour aider la detection sur peau foncee / faible lumiere
      this.procCanvas = document.createElement('canvas');
      this.procCanvas.width  = W;
      this.procCanvas.height = H;
      this.procCtx = this.procCanvas.getContext('2d');

      const renderProc = () => {
        if (!this.active && !this._activating) return;
        // Boost lumiere : x1.6 + contraste +25%
        this.procCtx.filter = 'brightness(1.6) contrast(1.25)';
        try { this.procCtx.drawImage(this.videoEl, 0, 0, W, H); } catch(_) {}
        requestAnimationFrame(renderProc);
      };
      requestAnimationFrame(renderProc);

      this.statusEl.textContent = 'Chargement FaceMesh...';

      this.facemesh = ml5.faceMesh({ maxFaces: 1, flipped: true });
      // On passe le canvas BOOSTE a ML5 au lieu du video brut
      this.facemesh.detectStart(this.procCanvas, (results) => {
        try {
          this.faces = results;
          this._process();
          this._drawOverlay();
        } catch (err) {
          // Absorbe toute erreur de traitement - ne touche jamais a la camera
          console.warn('[FaceMesh callback]', err.message);
        }
      });

      // Tout s'est bien passe : on marque comme actif
      this.active = true;
      document.getElementById('webcam-wrapper').classList.add('visible');
      this.btn.textContent = 'CAMERA ON';
      this.btn.classList.add('btn-active');
      this.btn.disabled = true; // Plus jamais cliquable - evite tout probleme
      this.statusEl.textContent = 'Pret - Faites vos grimaces !';

    } catch (e) {
      console.error('[FaceMesh] Erreur activation:', e);

      // Affiche l'erreur mais NE TOUCHE PAS au DOM webcam-wrapper
      // (au cas ou un autre activate est en cours et a deja reussi)
      if (e.name === 'NotAllowedError')
        this.statusEl.textContent = 'Autorise la camera dans Chrome';
      else if (e.name === 'NotReadableError')
        this.statusEl.textContent = 'Camera occupee - ferme Zoom/Teams';
      else
        this.statusEl.textContent = 'Erreur : ' + (e.message || e.name);

    } finally {
      this._activating = false;
    }
  }

  _process() {
    if (!this.faces?.length) {
      this.mouthOpen = this.mouthWide = this.eyebrowRaised = this.smiling = false;
      this.mouthRatio = this.browRatio = this.smileRatio = 0;
      return;
    }

    const kps = this.faces[0].keypoints;
    if (!kps || kps.length < 400) return;

    // Reference : hauteur visage front -> menton
    const forehead = kps[10], chin = kps[152];
    const faceH = Math.max(Math.abs(chin.y - forehead.y), 40);

    // Bouche : ecart levres
    this.mouthRatio = Math.abs(kps[14].y - kps[13].y) / faceH;

    // Sourcils : distance sourcil - oeil (les 2 yeux)
    const lR = (kps[159].y - kps[105].y) / faceH;
    const rR = (kps[386].y - kps[334].y) / faceH;
    this.browRatio = (lR + rR) / 2;

    // Sourire : largeur bouche
    this.smileRatio = Math.abs(kps[291].x - kps[61].x) / faceH;

    // Seuils FIXES tres sensibles (regarde la valeur BOUCHE dans le debug HUD)
    this.mouthOpen     = this.mouthRatio > 0.025;
    this.mouthWide     = this.mouthRatio > 0.07;
    this.eyebrowRaised = this.browRatio  > 0.18;
    this.smiling       = this.smileRatio > 0.50 && !this.mouthOpen;
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

    // Bouche
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

    // Sourcils
    const bc = this.eyebrowRaised ? '#ff8800' : '#666';
    ctx.fillStyle = bc; ctx.shadowColor = bc;
    for (const i of [105, 334]) {
      if (!kps[i]) continue;
      ctx.beginPath(); ctx.arc(kps[i].x, kps[i].y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Barres
    this._drawBar(ctx, 2, 2,  W-4, 11, this.mouthRatio,  0.025, 0.07, '#ffdd00', 'BOUCHE');
    this._drawBar(ctx, 2, 15, W-4, 11, this.browRatio,   0.18,  0.28, '#ff8800', 'BROW');
    this._drawBar(ctx, 2, 28, W-4, 11, this.smileRatio,  0.50,  0.65, '#44ff88', 'SMILE');

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
  }

  _drawBar(ctx, x, y, w, h, value, t1, t2, color, label) {
    const maxVal = Math.max(t2 * 2, 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, h);
    const filled = Math.min(value / maxVal, 1) * w;
    ctx.fillStyle = value >= t2 ? '#ff2288' : value >= t1 ? color : 'rgba(70,70,70,0.6)';
    ctx.fillRect(x, y, filled, h);
    [t1, t2].forEach(t => {
      const tx = x + (t / maxVal) * w;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y+h); ctx.stroke();
    });
    ctx.fillStyle = '#fff'; ctx.font = '7px monospace';
    ctx.fillText(`${label}:${value.toFixed(3)}`, x+2, y+h-1);
  }
}
