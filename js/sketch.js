'use strict';

const CANVAS_W = 860;
const CANVAS_H = 500;
const GROUND_Y = 415;
const PLAYER_X = 150;

const AI_CFG = { size: 20, mutationRate: 0.06, mutationStrength: 0.22 };

let player, obstacles, aiPop, face, audio, particles;
let gameState  = 'PLAYING';
let highScore  = 0;
let bgScroll   = 0;

// Etoiles fixes scintillantes
let _stars = [];
// Particules ambiantes (poussiere cyberpunk qui flotte)
let _dustParticles = [];

// Empêche le saut continu si on garde la bouche ouverte
let _jumpLatch  = false;
let _dashLatch  = false;
let _shieldLatch = false;

// ─── setup ────────────────────────────────────────────────────────────────────
function setup() {
  const cnv = createCanvas(CANVAS_W, CANVAS_H);
  cnv.parent('canvas-container');
  frameRate(60);

  audio     = new AudioSystem();
  particles = new ParticleSystem();
  face      = new FaceMeshController();

  // Etoiles dans le ciel (fixes)
  for (let i = 0; i < 80; i++) {
    _stars.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * (GROUND_Y - 150),
      s: Math.random() * 1.8 + 0.4,
      a: Math.random() * 200 + 50,
      p: Math.random() * Math.PI * 2,
    });
  }
  // Particules de poussiere ambiante
  for (let i = 0; i < 40; i++) {
    const palette = [[0,255,200], [255,80,180], [255,210,0], [120,180,255]];
    _dustParticles.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * GROUND_Y,
      s: Math.random() * 2.2 + 0.5,
      a: Math.random() * 80 + 30,
      spd: Math.random() * 0.4 + 0.1,
      ph: Math.random() * Math.PI * 2,
      col: palette[Math.floor(Math.random() * palette.length)],
    });
  }

  _initGame();
  _setupUI();

  // Activer audio au premier clic / touche
  const initAudio = () => { if (!audio.initialized) audio.init(); };
  document.addEventListener('click',   initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });

  // Donner le focus au canvas pour capter les touches immédiatement
  const cnvEl = document.querySelector('canvas');
  if (cnvEl) { cnvEl.setAttribute('tabindex', '0'); cnvEl.focus(); }

  // Démarrage automatique de la caméra après 2s
  // (évite tout problème de bouton/focus)
  setTimeout(() => face._activate(), 2000);
}

function _initGame() {
  player    = new Player(PLAYER_X, GROUND_Y);
  obstacles = new ObstacleManager(GROUND_Y, CANVAS_H, CANVAS_W);
  aiPop     = new AIPopulation(GROUND_Y, AI_CFG);
}

// ─── draw ─────────────────────────────────────────────────────────────────────
function draw() {
  _drawBackground();
  _drawGround();

  // Mise à jour obstacles (toujours, même en attente — pour l'animation démo)
  obstacles.update();

  // ── Gestion du jeu ─────────────────────────────────────────────────────────
  if (gameState === 'PLAYING') {
    _applyFaceControls();
    player.update();

    // Collision player
    if (obstacles.checkCollision(player, player.dashTimer > 0)) {
      if (player.hit()) {
        audio.hit();
        particles.crash(player.x, player.y - player.H / 2);
      }
    }

    // Game over
    if (player.state === 'DEAD') {
      gameState = 'GAMEOVER';
      highScore = Math.max(highScore, player.score);
      audio.death();
    }
  }

  // IA tourne toujours
  if (aiPop.update(obstacles)) {
    audio.playEvolution(aiPop.generation);
    _updateAIStats();
  }

  bgScroll += obstacles.speed;
  particles.update();

  // ── Dessin ──────────────────────────────────────────────────────────────────
  obstacles.draw(this);
  aiPop.draw(this);
  if (gameState === 'PLAYING') player.draw(this);
  particles.draw(this);

  _drawHUD();
  _drawFaceDebug();
  _drawWebcamPIP();
  _drawSpeedLines();

  if (gameState === 'GAMEOVER') _drawGameOverScreen();
  _drawControls();

  _updateStats();
}

// ─── Contrôles FaceMesh → Player ─────────────────────────────────────────────
function _applyFaceControls() {
  if (!face.active) return;

  // Saut — latch pour éviter saut continu (re-ouvre la bouche entre chaque saut)
  if (face.mouthWide && !_jumpLatch) {
    if (player.jump(true)) { audio.superJump(); _jumpLatch = true; }
  } else if (face.mouthOpen && !face.mouthWide && !_jumpLatch) {
    if (player.jump(false)) { audio.jump(); _jumpLatch = true; }
  } else if (!face.mouthOpen) {
    _jumpLatch = false;
  }

  // Dash
  if (face.eyebrowRaised && !_dashLatch) {
    if (player.dash()) { audio.dash(); _dashLatch = true; }
  } else if (!face.eyebrowRaised) {
    _dashLatch = false;
  }

  // Bouclier
  if (face.smiling && !_shieldLatch) {
    if (player.activateShield()) { audio.shield(); _shieldLatch = true; }
  } else if (!face.smiling) {
    _shieldLatch = false;
  }
}

// ─── Fond cyberpunk multi-couches avec soleil neon ────────────────────────────
function _drawBackground() {
  // Gradient violet -> bleu nuit
  for (let y = 0; y < GROUND_Y; y += 4) {
    const t = y / GROUND_Y;
    const r = 18 + (8 - 18)  * t;
    const g = 6  + (8 - 6)   * t;
    const b = 32 + (22 - 32) * t;
    stroke(r, g, b); strokeWeight(4);
    line(0, y, CANVAS_W, y);
  }
  noStroke();

  // ── Gros soleil neon avec lignes horizontales (synthwave) ───────────────────
  const SUN_X = CANVAS_W * 0.72, SUN_Y = GROUND_Y - 90, SUN_R = 110;
  drawingContext.shadowBlur = 50;
  drawingContext.shadowColor = 'rgba(255,80,180,0.85)';
  // Disque gradient
  for (let r = SUN_R; r > 0; r -= 4) {
    const t = r / SUN_R;
    fill(255 - 60 * t, 80 + 100 * (1-t), 180 - 50 * t, 230);
    circle(SUN_X, SUN_Y, r * 2);
  }
  drawingContext.shadowBlur = 0;
  // Bandes horizontales noires sur le soleil
  fill(8, 6, 22);
  for (let i = 0; i < 6; i++) {
    const sy = SUN_Y - SUN_R + 60 + i * 14;
    rect(SUN_X - SUN_R, sy, SUN_R * 2, 4 + i * 0.5);
  }

  // ── Etoiles scintillantes ───────────────────────────────────────────────────
  for (const s of _stars) {
    const tw = 0.5 + 0.5 * Math.sin(frameCount * 0.05 + s.p);
    fill(255, 255, 255, s.a * tw);
    circle(s.x, s.y, s.s);
  }

  // ── Montagnes lointaines (parallaxe lente 5%) ───────────────────────────────
  const mOff = bgScroll * 0.05;
  fill(28, 14, 50);
  drawingContext.shadowBlur = 14;
  drawingContext.shadowColor = 'rgba(140,20,200,0.5)';
  beginShape();
  vertex(-10, GROUND_Y);
  for (let i = 0; i <= 16; i++) {
    const x = (i * 70 - mOff % 70);
    const h = 60 + Math.sin(i * 1.7) * 30 + Math.cos(i * 0.8) * 25;
    vertex(x, GROUND_Y - 30 - h);
  }
  vertex(CANVAS_W + 10, GROUND_Y);
  endShape(CLOSE);
  drawingContext.shadowBlur = 0;

  // ── Bâtiments parallaxe 12% ─────────────────────────────────────────────────
  const BUILDINGS = [
    { ox:0,   w:75, h:130 }, { ox:120, w:55, h:190 }, { ox:210, w:95, h:105 },
    { ox:340, w:65, h:215 }, { ox:450, w:85, h:145 }, { ox:575, w:50, h:230 },
    { ox:665, w:80, h:170 }, { ox:780, w:60, h:195 },
  ];
  const bOff = bgScroll * 0.12;
  for (const b of BUILDINGS) {
    const bx = ((b.ox - bOff % CANVAS_W) % CANVAS_W + CANVAS_W) % CANVAS_W;
    // Silhouette
    fill(14, 10, 32);
    rect(bx, GROUND_Y - b.h - 20, b.w, b.h);
    // Bordure néon en haut
    fill(0, 255, 200, 90);
    rect(bx, GROUND_Y - b.h - 20, b.w, 2);
    // Fenêtres animées
    for (let wy = 12; wy < b.h - 12; wy += 22) {
      for (let wx = 8; wx < b.w - 8; wx += 16) {
        const seed = (b.ox + wx * 7 + wy * 13) % 10;
        if (seed < 6) {
          // Couleur cyan/magenta selon seed
          const c = seed < 3 ? [0, 200, 255] : [220, 80, 255];
          fill(...c, 90 + (seed * 12));
          rect(bx + wx, GROUND_Y - b.h - 20 + wy, 10, 12, 1);
        }
      }
    }
  }

  // ── Particules ambiantes flottantes (cyberpunk dust) ───────────────────────
  for (const p of _dustParticles) {
    p.x -= obstacles.speed * p.spd;
    p.y += Math.sin(frameCount * 0.02 + p.ph) * 0.3;
    if (p.x < -5) { p.x = CANVAS_W + 5; p.y = Math.random() * GROUND_Y; }
    fill(p.col[0], p.col[1], p.col[2], p.a);
    circle(p.x, p.y, p.s);
  }
}

// ─── Sol avec grille perspective défilante ────────────────────────────────────
function _drawGround() {
  // Ligne de sol néon
  strokeWeight(2); noFill();
  stroke(0, 255, 200, 220);
  drawingContext.shadowBlur  = 12;
  drawingContext.shadowColor = 'rgba(0,255,200,0.7)';
  line(0, GROUND_Y, CANVAS_W, GROUND_Y);
  drawingContext.shadowBlur = 0;

  // Grille perspective (vertical + horizontal)
  const gStep   = 65;
  const gOffset = bgScroll % gStep;
  stroke(0, 255, 200, 22); strokeWeight(1);
  for (let x = -gOffset; x < CANVAS_W + gStep; x += gStep) {
    line(x, GROUND_Y, x, CANVAS_H);
  }
  for (let row = 0, y = GROUND_Y; y < CANVAS_H; row++, y += 24 + row * 4) {
    stroke(0, 255, 200, Math.max(4, 18 - row * 3));
    line(0, y, CANVAS_W, y);
  }
}

// ─── HUD dans le canvas ────────────────────────────────────────────────────────
function _drawHUD() {
  drawingContext.shadowBlur = 0;
  // Panneau score
  noStroke(); fill(0, 0, 0, 115);
  rect(8, 8, 200, 46, 5);
  textFont('monospace'); textAlign(LEFT);
  textSize(11);
  fill(0, 255, 200); text(`SCORE  ${Math.floor(player.score / 10)}`, 16, 24);
  fill(255, 210, 0); text(`RECORD ${Math.floor(highScore / 10)}`, 16, 40);

  // Indicateurs gestes actifs (bas gauche)
  if (face.active && gameState === 'PLAYING') {
    const gestures = [
      { label: 'BOUCHE → SAUT',         active: face.mouthOpen  && !face.mouthWide, col: [255, 220, 0]   },
      { label: 'GRANDE BOUCHE → SUPER', active: face.mouthWide,                     col: [255, 60, 160]  },
      { label: 'SOURCILS → DASH',       active: face.eyebrowRaised,                 col: [255, 140, 0]   },
      { label: 'SOURIRE → BOUCLIER',    active: face.smiling,                       col: [60, 255, 140]  },
    ];
    fill(0, 0, 0, 100);
    rect(8, CANVAS_H - 72, 220, 64, 5);
    textSize(9);
    gestures.forEach(({ label, active, col }, i) => {
      const c = active ? col : [70, 70, 90];
      fill(...c, active ? 255 : 160);
      if (active) { drawingContext.shadowBlur = 5; drawingContext.shadowColor = `rgba(${col},0.8)`; }
      text(label, 15, CANVAS_H - 56 + i * 14);
      drawingContext.shadowBlur = 0;
    });
  } else if (!face.active && gameState === 'PLAYING') {
    fill(0, 0, 0, 100); rect(8, CANVAS_H - 34, 280, 26, 5);
    fill(0, 200, 255, 180); textSize(10);
    text('Active ta main → ou clavier : ESPACE/↓/A', 14, CANVAS_H - 18);
  }

  // Vitesse en haut à droite
  fill(0, 0, 0, 100); rect(CANVAS_W - 95, 8, 86, 28, 5);
  fill(255, 200, 0); textSize(10);
  textAlign(RIGHT);
  text(`VITESSE ${obstacles.speed.toFixed(1)}`, CANVAS_W - 10, 27);
  textAlign(LEFT);
}

// ─── Lignes de vitesse quand on va vite (effet motion blur) ──────────────────
function _drawSpeedLines() {
  if (gameState !== 'PLAYING') return;
  const intensity = (obstacles.speed - 4.2) / 5.3; // 0 a 1
  if (intensity < 0.15) return;

  noStroke();
  const count = Math.floor(8 + intensity * 12);
  for (let i = 0; i < count; i++) {
    const seed = (i * 137 + frameCount * 3) % 1000;
    const y = (seed * 7) % CANVAS_H;
    const len = 30 + (seed % 60);
    const x = ((seed * 13 + frameCount * obstacles.speed * 4) % (CANVAS_W + len)) - len;
    const alpha = 60 * intensity;
    fill(255, 255, 255, alpha);
    rect(x, y, len, 1.2);
  }
}

// ─── Webcam Picture-in-Picture dessinee DIRECTEMENT dans le canvas du jeu ────
// Aucune manipulation DOM ne peut la cacher - elle fait partie du jeu
function _drawWebcamPIP() {
  if (!face.active || !face.videoEl) return;
  if (face.videoEl.readyState < 2) return;

  const PW = 140, PH = 105;
  const px = CANVAS_W - PW - 12;
  const py = 50;

  // Cadre
  noStroke(); fill(0, 0, 0, 200);
  rect(px - 4, py - 4, PW + 8, PH + 8, 5);

  // Video miroire
  push();
  translate(px + PW, py);
  scale(-1, 1);
  try { image(face.videoEl, 0, 0, PW, PH); } catch (e) {}
  pop();

  // Bordure couleur selon geste detecte
  let bc = color(0, 200, 255);
  if (face.mouthWide)          bc = color(255, 30, 130);
  else if (face.mouthOpen)     bc = color(255, 220, 0);
  else if (face.eyebrowRaised) bc = color(255, 140, 0);
  else if (face.smiling)       bc = color(60, 255, 140);
  noFill(); stroke(bc); strokeWeight(2);
  drawingContext.shadowBlur = 8; drawingContext.shadowColor = bc.toString();
  rect(px - 2, py - 2, PW + 4, PH + 4, 5);
  drawingContext.shadowBlur = 0;

  // Landmarks superposes (mirroir)
  if (face.faces?.length && face.videoEl.videoWidth) {
    const kps = face.faces[0].keypoints;
    const sx = PW / face.videoEl.videoWidth;
    const sy = PH / face.videoEl.videoHeight;
    noStroke(); fill(0, 255, 200, 110);
    for (const kp of kps) {
      const x = px + PW - kp.x * sx;
      const y = py + kp.y * sy;
      ellipse(x, y, 1.4);
    }
    // Points cles bouche en gros
    fill(bc);
    for (const i of [13, 14, 61, 291]) {
      if (!kps[i]) continue;
      ellipse(px + PW - kps[i].x * sx, py + kps[i].y * sy, 4);
    }
  }

  // Label en bas du PIP
  fill(255); noStroke(); textSize(8); textAlign(LEFT);
  text('FACEMESH ML5', px + 4, py + PH - 4);
}

// ─── Debug FaceMesh - valeurs brutes affichees dans le canvas du jeu ─────────
function _drawFaceDebug() {
  if (!face.active) return;

  // Position : sous la PIP webcam
  const x = CANVAS_W - 200, y = 170;
  noStroke(); fill(0, 0, 0, 140);
  rect(x - 8, y - 14, 196, 70, 5);

  textFont('monospace'); textSize(9); textAlign(LEFT);

  // Visage detecte ?
  const ok = face.faces?.length > 0;
  fill(ok ? color(0, 255, 200) : color(255, 60, 60));
  text(ok ? 'Visage OK' : 'Aucun visage', x, y);

  // Etat de chaque action
  const actions = [
    { label: 'BOUCHE',   val: face.mouthRatio, on: face.mouthOpen,     c: [255,220,0] },
    { label: 'GR.BOUCHE',val: face.mouthRatio, on: face.mouthWide,     c: [255,30,130] },
    { label: 'SOURCILS', val: face.browRatio,  on: face.eyebrowRaised, c: [255,140,0] },
    { label: 'SOURIRE',  val: face.smileRatio, on: face.smiling,       c: [60,255,140] },
  ];
  actions.forEach(({ label, val, on, c }, i) => {
    fill(on ? color(...c) : color(110, 110, 130));
    text(`${on ? '>>' : '  '} ${label.padEnd(9)} ${val.toFixed(3)}`, x, y + 14 + i * 11);
  });
}

// ─── Rappel des touches (coin bas droit, toujours visible) ───────────────────
function _drawControls() {
  noStroke(); textFont('monospace'); textAlign(RIGHT); textSize(9);
  fill(0, 0, 0, 90); rect(CANVAS_W - 170, CANVAS_H - 58, 162, 50, 5);
  fill(0, 200, 255, 180);
  text('ESPACE = saut', CANVAS_W - 10, CANVAS_H - 42);
  text('MAJ = super saut  ↓ = dash', CANVAS_W - 10, CANVAS_H - 28);
  text('A = bouclier', CANVAS_W - 10, CANVAS_H - 14);
  textAlign(LEFT);
}

// ─── Écran d'attente ─────────────────────────────────────────────────────────
function _drawWaitScreen() {
  fill(0, 0, 0, 160); noStroke(); rect(0, 0, CANVAS_W, CANVAS_H);
  textAlign(CENTER);
  drawingContext.shadowBlur = 22; drawingContext.shadowColor = 'rgba(0,255,200,0.9)';
  fill(0, 255, 200); textSize(44); textFont('monospace');
  text('GRIMACE RUN', CANVAS_W / 2, CANVAS_H / 2 - 55);
  drawingContext.shadowBlur = 0;

  fill(255, 210, 0); textSize(13);
  text('Active ta caméra ou appuie sur ESPACE pour jouer', CANVAS_W / 2, CANVAS_H / 2);

  fill(180, 180, 210); textSize(10);
  text('😮 BOUCHE → SAUT   🤨 SOURCILS → DASH   😄 SOURIRE → BOUCLIER', CANVAS_W / 2, CANVAS_H / 2 + 28);
  text('ESPACE = saut   MAJ = super saut   ↓ = dash   A = bouclier', CANVAS_W / 2, CANVAS_H / 2 + 48);

  fill(100, 100, 140); textSize(9);
  text(`Les runners IA apprennent en arrière-plan — Génération ${aiPop.generation}`, CANVAS_W / 2, CANVAS_H / 2 + 75);
  textAlign(LEFT);
}

// ─── Écran Game Over ─────────────────────────────────────────────────────────
function _drawGameOverScreen() {
  fill(0, 0, 0, 175); noStroke(); rect(0, 0, CANVAS_W, CANVAS_H);
  textAlign(CENTER); textFont('monospace');
  drawingContext.shadowBlur = 20; drawingContext.shadowColor = 'rgba(255,50,110,0.9)';
  fill(255, 50, 110); textSize(42);
  text('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 50);
  drawingContext.shadowBlur = 0;

  fill(255, 210, 0); textSize(20);
  text(`Score : ${Math.floor(player.score / 10)}`, CANVAS_W / 2, CANVAS_H / 2);
  if (player.score >= highScore * 10 && highScore > 0) {
    fill(0, 255, 200); textSize(14);
    text('NOUVEAU RECORD !', CANVAS_W / 2, CANVAS_H / 2 + 26);
  }

  fill(190, 190, 220); textSize(12);
  text('ESPACE ou clic pour recommencer', CANVAS_W / 2, CANVAS_H / 2 + 55);
  textAlign(LEFT);
}

// ─── Mise à jour stats HTML ───────────────────────────────────────────────────
function _updateStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-score', Math.floor(player.score / 10));
  set('stat-lives', player.lives);
  set('stat-speed', obstacles.speed.toFixed(1));
}
function _updateAIStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-gen',    aiPop.generation);
  set('stat-alive',  `${aiPop.getAliveCount()} / ${AI_CFG.size}`);
  set('stat-bestai', Math.floor(aiPop.bestFit / 10));
}

// ─── UI HTML ─────────────────────────────────────────────────────────────────
function _setupUI() {
  // Retire TOUS les boutons de l'ordre de tabulation :
  // empeche que ESPACE les active quand ils ont le focus
  document.querySelectorAll('button').forEach(btn => {
    btn.setAttribute('tabindex', '-1');
    // Empeche aussi les touches sur les boutons
    btn.addEventListener('keydown', e => e.preventDefault());
  });

  document.getElementById('btn-start')?.addEventListener('click', (e) => {
    if (!audio.initialized) audio.init();
    _initGame(); gameState = 'PLAYING';
    e.currentTarget.blur();
    document.querySelector('#canvas-container canvas')?.focus();
  });

  document.getElementById('btn-reset-ai')?.addEventListener('click', (e) => {
    aiPop.reset(); _updateAIStats();
    e.currentTarget.blur();
  });
}

// ─── Clavier ─────────────────────────────────────────────────────────────────
function _handleKey(code, k) {
  if (!audio.initialized) audio.init();
  if (code === 32 || k === ' ') {
    if (gameState === 'GAMEOVER') { _initGame(); gameState = 'PLAYING'; return; }
    if (gameState === 'PLAYING' && player.jump(false)) audio.jump();
  }
  if (code === 16) {
    if (gameState === 'PLAYING' && player.jump(true)) audio.superJump();
  }
  if (code === 40) {
    if (gameState === 'PLAYING' && player.dash()) audio.dash();
  }
  if (k === 'a' || k === 'A') {
    if (gameState === 'PLAYING' && player.activateShield()) audio.shield();
  }
}

// p5.js keyPressed - retourne false pour bloquer le comportement par defaut du navigateur
function keyPressed() {
  _handleKey(keyCode, key);
  return false; // empeche ESPACE de scroller ou d'activer des boutons
}

function mousePressed() {
  if (!audio.initialized) audio.init();
  if (gameState === 'GAMEOVER') { _initGame(); gameState = 'PLAYING'; }
}
