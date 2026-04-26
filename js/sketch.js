'use strict';

const CANVAS_W = 860;
const CANVAS_H = 500;
const GROUND_Y = 415;
const PLAYER_X = 150;

const AI_CFG = { size: 20, mutationRate: 0.06, mutationStrength: 0.22 };

let player, obstacles, aiPop, face, audio, particles;
let gameState  = 'INTRO'; // INTRO | PLAYING | GAMEOVER
let highScore  = 0;
let bgScroll   = 0;
let _introTimer = 0;
let _gameOverTimer = 0;

// Annonces flottantes ("Generation 5 !", "Combo x3", etc.)
let _announcements = [];
function _announce(text, color = [255, 220, 0]) {
  _announcements.push({ text, color, life: 120, y: CANVAS_H / 2 - 40 });
}
let _lastAnnouncedGen = 1;
let _comboCount = 0;
let _lastObstacleScore = 0;

// Score popups (+10 qui flotte depuis les obstacles)
let _scorePopups = [];
// Confettis pour celebrer (nouvelle generation, record, etc.)
let _confettis = [];
// Coeurs flottants quand bouclier
let _hearts = [];
// Etincelles derriere le joueur (combo / vitesse)
let _sparkles = [];

// Screen shake
let _shakeTimer = 0;
let _shakeAmount = 0;
function _shake(amount = 8, duration = 12) {
  _shakeTimer = duration; _shakeAmount = amount;
}

// Suivi obstacles passes pour les +10
let _passedObstacles = new WeakSet();

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
  // SCREEN SHAKE
  push();
  if (_shakeTimer > 0) {
    const sx = (Math.random() - 0.5) * _shakeAmount;
    const sy = (Math.random() - 0.5) * _shakeAmount;
    translate(sx, sy);
    _shakeTimer--;
    _shakeAmount *= 0.9;
  }

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
        _shake(10, 16); // SCREEN SHAKE
        _spawnConfetti(player.x, player.y - 25, 20, [[255,40,80],[255,120,0]]);
        _comboCount = 0;
      }
    }

    // Score popups +10 quand un obstacle passe le joueur
    for (const o of obstacles.obstacles) {
      if (!o.passed && o.x + o.w < player.x - 5 && o.alive) {
        o.passed = true;
        const points = o.type === 'PIT' ? 20 : 10;
        _scorePopups.push({
          text: `+${points}`,
          x: player.x + 50,
          y: player.y - 60,
          vy: 1.4, life: 50, scale: 0.5,
          col: o.type === 'PIT' ? [180,80,255] : (o.type === 'BAR' ? [255,140,0] : [255,80,80]),
        });
        _spawnSparkles(player.x + 30, player.y - 30, 6, [255,220,0]);
      }
    }

    // Coeurs qui montent quand bouclier actif
    if (player.shielded && frameCount % 6 === 0) {
      _hearts.push({
        x: player.x + (Math.random() - 0.5) * 30,
        y: player.y - 20,
        vy: 1.2, life: 50, scale: 0.7 + Math.random() * 0.3,
      });
    }

    // Etincelles derriere le joueur quand on va vite
    if (obstacles.speed > 6 && frameCount % 3 === 0) {
      _spawnSparkles(player.x - 18, player.y - 20, 1,
        obstacles.speed > 8 ? [255,80,180] : [0,200,255]);
    }

    // Game over
    if (player.state === 'DEAD') {
      gameState = 'GAMEOVER';
      _gameOverTimer = 0;
      highScore = Math.max(highScore, player.score);
      audio.death();
      _shake(15, 25);
      _spawnConfetti(player.x, player.y - 25, 40, [[255,40,80],[200,20,40]]);
    }
  } else if (gameState === 'INTRO') {
    _introTimer++;
    if (_introTimer > 180) {
      gameState = 'PLAYING';
      _announce('GO !', [255, 60, 110]);
    }
  } else if (gameState === 'GAMEOVER') {
    _gameOverTimer++;
  }

  // IA tourne toujours
  if (aiPop.update(obstacles)) {
    audio.playEvolution(aiPop.generation);
    _updateAIStats();
    // Annonce passage de generation + CONFETTIS !
    if (aiPop.generation > _lastAnnouncedGen) {
      _lastAnnouncedGen = aiPop.generation;
      _announce(`GENERATION ${aiPop.generation}`, [0, 255, 200]);
      _spawnConfetti(CANVAS_W / 2, CANVAS_H / 2, 40);
      if (aiPop.generation % 5 === 0) {
        _announce(`L'IA APPREND...`, [180, 100, 255]);
        _spawnConfetti(CANVAS_W * 0.3, CANVAS_H / 2, 25);
        _spawnConfetti(CANVAS_W * 0.7, CANVAS_H / 2, 25);
      }
    }
  }

  // Detection de combos (obstacles passes consecutifs sans collision)
  if (gameState === 'PLAYING' && obstacles.frame > _lastObstacleScore + 100) {
    _comboCount++;
    _lastObstacleScore = obstacles.frame;
    if (_comboCount >= 3 && _comboCount % 3 === 0) {
      _announce(`COMBO x${_comboCount}`, [255, 220, 0]);
    }
  }
  if (gameState === 'GAMEOVER' && _comboCount > 0) {
    _comboCount = 0;
    _lastObstacleScore = 0;
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
  _drawMoodRing();
  _drawBrainViz();
  _drawFitnessGraph();
  _drawAnnouncements();

  if (gameState === 'INTRO')    _drawIntroScreen();
  if (gameState === 'GAMEOVER') _drawGameOverScreen();
  _drawControls();

  _updateStats();
  pop(); // fin screen shake

  // Effets fun (par-dessus tout, pas affectes par le shake)
  _updateAndDrawFunEffects();
}

// ─── EFFETS FUN : popups, confettis, coeurs, etincelles ──────────────────────
function _updateAndDrawFunEffects() {
  // Score popups +10 +20 etc
  for (let i = _scorePopups.length - 1; i >= 0; i--) {
    const p = _scorePopups[i];
    p.y -= p.vy; p.vy *= 0.96; p.life--;
    if (p.life <= 0) { _scorePopups.splice(i, 1); continue; }
    const a = Math.min(p.life / 30, 1) * 255;
    drawingContext.shadowBlur = 8;
    drawingContext.shadowColor = `rgba(${p.col.join(',')},${a/255})`;
    fill(p.col[0], p.col[1], p.col[2], a);
    noStroke(); textAlign(CENTER); textFont('monospace');
    textSize(16 * p.scale);
    text(p.text, p.x, p.y);
    drawingContext.shadowBlur = 0;
    p.scale = Math.min(p.scale + 0.04, 1);
  }

  // Confettis colores
  for (let i = _confettis.length - 1; i >= 0; i--) {
    const c = _confettis[i];
    c.x += c.vx; c.y += c.vy; c.vy += 0.18;
    c.angle += c.spin; c.life--;
    if (c.life <= 0 || c.y > CANVAS_H + 20) { _confettis.splice(i, 1); continue; }
    push(); translate(c.x, c.y); rotate(c.angle);
    fill(c.col[0], c.col[1], c.col[2], Math.min(c.life * 5, 255));
    noStroke();
    rect(-c.w/2, -c.h/2, c.w, c.h);
    pop();
  }

  // Coeurs qui montent quand bouclier
  for (let i = _hearts.length - 1; i >= 0; i--) {
    const h = _hearts[i];
    h.y -= h.vy; h.x += Math.sin(h.life * 0.1) * 0.4;
    h.life--;
    if (h.life <= 0) { _hearts.splice(i, 1); continue; }
    const a = Math.min(h.life / 40, 1);
    push(); translate(h.x, h.y); scale(h.scale);
    fill(255, 80, 130, 255 * a); noStroke();
    drawingContext.shadowBlur = 8; drawingContext.shadowColor = 'rgba(255,80,130,0.9)';
    // Forme de coeur
    ellipse(-3.5, 0, 7, 6);
    ellipse( 3.5, 0, 7, 6);
    triangle(-7, 1, 7, 1, 0, 9);
    drawingContext.shadowBlur = 0;
    pop();
  }

  // Etincelles
  for (let i = _sparkles.length - 1; i >= 0; i--) {
    const s = _sparkles[i];
    s.x += s.vx; s.y += s.vy;
    s.vx *= 0.95; s.vy *= 0.95;
    s.life--;
    if (s.life <= 0) { _sparkles.splice(i, 1); continue; }
    const a = (s.life / s.maxLife) * 255;
    fill(s.col[0], s.col[1], s.col[2], a); noStroke();
    drawingContext.shadowBlur = 4;
    drawingContext.shadowColor = `rgb(${s.col.join(',')})`;
    // Etoile a 4 branches
    push(); translate(s.x, s.y); rotate(s.life * 0.1);
    quad(0, -s.size, s.size*0.3, 0, 0, s.size, -s.size*0.3, 0);
    quad(-s.size, 0, 0, -s.size*0.3, s.size, 0, 0, s.size*0.3);
    pop();
    drawingContext.shadowBlur = 0;
  }
}

function _spawnConfetti(x, y, count = 30, palette = null) {
  const colors = palette || [[0,255,200],[255,210,0],[255,80,180],[60,255,140],[120,180,255]];
  for (let i = 0; i < count; i++) {
    _confettis.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 9 - 3,
      w:  3 + Math.random() * 4,
      h:  6 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.3,
      life:  60 + Math.random() * 40,
      col:   colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function _spawnSparkles(x, y, count = 5, col = [255,220,0]) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp  = 1 + Math.random() * 3;
    const life = 25 + Math.random() * 20;
    _sparkles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      size: 2 + Math.random() * 2,
      life, maxLife: life,
      col,
    });
  }
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

// ─── VISUALISEUR DU CERVEAU IA EN TEMPS REEL ─────────────────────────────────
// Le coeur creatif du projet : on VOIT le reseau de neurones decider en direct
function _drawBrainViz() {
  const best = aiPop.getBestAlive();
  if (!best || !best.lastActivations) return;

  const acts = best.lastActivations; // [inputs(6), hidden(8), outputs(2)]
  const brain = best.brain;
  if (!brain || !brain.layers) return;

  // Position : coin bas-droit, sous la PIP webcam
  const X = CANVAS_W - 280, Y = 200, W = 270, H = 175;

  // Fond
  noStroke(); fill(0, 0, 0, 200);
  rect(X, Y, W, H, 6);
  stroke(0, 255, 200, 80); strokeWeight(1); noFill();
  rect(X, Y, W, H, 6);
  noStroke();

  // Titre
  fill(0, 255, 200);
  textFont('monospace'); textSize(9); textAlign(LEFT);
  drawingContext.shadowBlur = 6; drawingContext.shadowColor = 'rgba(0,255,200,0.8)';
  text('CERVEAU IA - LIVE', X + 8, Y + 12);
  drawingContext.shadowBlur = 0;
  fill(140, 200, 255); textSize(7);
  text(`Fitness ${best.fitness}  |  6 -> 8 -> 2`, X + 8, Y + 22);

  // Positions des couches
  const layerXs = [X + 30, X + W/2, X + W - 30];
  const labels = {
    inputs:  ['dist1', 'type1', 'haut1', 'dist2', 'hauteur', 'vitesse'],
    outputs: ['SAUT', 'DASH'],
  };

  // Calcul positions des neurones
  const neuronPos = acts.map((layer, li) => {
    return layer.map((_, ni) => {
      const layerY = Y + 35 + (H - 50) * (ni + 1) / (layer.length + 1);
      return { x: layerXs[li], y: layerY };
    });
  });

  // Connexions (lignes) - epaisseur = |poids|, couleur = signe
  for (let l = 0; l < brain.layers.length; l++) {
    const { weights } = brain.layers[l];
    const fromActs = acts[l];
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights[i].length; j++) {
        const w = weights[i][j];
        const absW = Math.min(Math.abs(w), 2);
        const flow = fromActs[i] * w; // intensite reelle
        const alpha = 30 + Math.min(Math.abs(flow) * 120, 180);
        if (w > 0) stroke(0, 255, 200, alpha);
        else       stroke(255, 60, 110, alpha);
        strokeWeight(0.3 + absW * 1.2);
        line(neuronPos[l][i].x, neuronPos[l][i].y,
             neuronPos[l+1][j].x, neuronPos[l+1][j].y);
      }
    }
  }
  noStroke();

  // Neurones (cercles colores selon activation)
  for (let li = 0; li < acts.length; li++) {
    const layer = acts[li];
    for (let ni = 0; ni < layer.length; ni++) {
      const a = layer[ni];
      const pos = neuronPos[li][ni];
      const intensity = Math.min(Math.abs(a), 1);
      // Couleur selon activation (positif=cyan, negatif=magenta)
      const r = a > 0 ? 0   : 255;
      const g = a > 0 ? 255 : 60;
      const b = a > 0 ? 200 : 110;
      drawingContext.shadowBlur = 6 * intensity;
      drawingContext.shadowColor = `rgb(${r},${g},${b})`;
      // Coeur
      fill(r, g, b, 100 + intensity * 155);
      circle(pos.x, pos.y, 8 + intensity * 4);
      // Bordure
      stroke(r, g, b);
      strokeWeight(1);
      noFill();
      circle(pos.x, pos.y, 9);
      noStroke();
      drawingContext.shadowBlur = 0;
    }
  }

  // Labels entrees
  fill(140, 180, 255); textSize(6.5); textAlign(RIGHT);
  for (let i = 0; i < 6; i++) {
    text(labels.inputs[i], neuronPos[0][i].x - 7, neuronPos[0][i].y + 2);
  }
  // Labels sorties
  textAlign(LEFT);
  for (let i = 0; i < 2; i++) {
    const fired = acts[acts.length-1][i] > 0.45;
    fill(fired ? color(255, 60, 110) : color(140, 180, 255));
    textSize(fired ? 9 : 7);
    drawingContext.shadowBlur = fired ? 8 : 0;
    drawingContext.shadowColor = 'rgba(255,60,110,0.9)';
    text(labels.outputs[i] + (fired ? ' !' : ''), neuronPos[2][i].x + 7, neuronPos[2][i].y + 2);
    drawingContext.shadowBlur = 0;
  }
}

// ─── GRAPHIQUE D'APPRENTISSAGE : fitness sur les N dernieres generations ─────
function _drawFitnessGraph() {
  if (!aiPop.history?.length) return;

  const X = 8, Y = CANVAS_H - 130, W = 250, H = 75;

  noStroke(); fill(0, 0, 0, 180);
  rect(X, Y, W, H, 5);
  stroke(0, 255, 200, 60); noFill();
  rect(X, Y, W, H, 5);
  noStroke();

  // Titre
  fill(0, 255, 200);
  textFont('monospace'); textSize(8); textAlign(LEFT);
  text('FITNESS - APPRENTISSAGE IA', X + 6, Y + 11);

  const hist = aiPop.history;
  const maxFit = Math.max(...hist.map(h => h.best), 50);
  const padX = 8, padY = 18, gW = W - padX * 2, gH = H - padY - 10;

  // Grille horizontale
  stroke(0, 255, 200, 25); strokeWeight(1);
  for (let i = 0; i <= 3; i++) {
    const gy = Y + padY + (gH * i / 3);
    line(X + padX, gy, X + W - padX, gy);
  }
  noStroke();

  // Ligne de l'evolution (best)
  stroke(0, 255, 200); strokeWeight(2);
  drawingContext.shadowBlur = 6; drawingContext.shadowColor = 'rgba(0,255,200,0.7)';
  noFill();
  beginShape();
  for (let i = 0; i < hist.length; i++) {
    const x = X + padX + (gW * i / Math.max(hist.length - 1, 1));
    const y = Y + padY + gH - (hist[i].best / maxFit) * gH;
    vertex(x, y);
  }
  endShape();
  drawingContext.shadowBlur = 0;

  // Ligne de la moyenne
  stroke(255, 220, 0, 180); strokeWeight(1.2);
  beginShape();
  for (let i = 0; i < hist.length; i++) {
    const x = X + padX + (gW * i / Math.max(hist.length - 1, 1));
    const y = Y + padY + gH - (hist[i].avg / maxFit) * gH;
    vertex(x, y);
  }
  endShape();
  noStroke();

  // Legende
  textSize(7); textAlign(LEFT);
  fill(0, 255, 200); text('— meilleur', X + W - 90, Y + 11);
  fill(255, 220, 0); text('— moyenne', X + W - 90, Y + 21);

  // Stats actuelles
  fill(160, 200, 255); textSize(8);
  const last = hist[hist.length - 1];
  text(`Gen ${aiPop.generation}  |  Best ${aiPop.allTimeBest}  |  Pop ${AI_CFG.size}`,
       X + 6, Y + H - 4);
}

// ─── Mood Ring : les bords du jeu reagissent a ton emotion faciale ──────────
function _drawMoodRing() {
  if (!face.active) return;

  let col = null;
  if (face.mouthWide)          col = [255, 30, 130];
  else if (face.smiling)       col = [60, 255, 140];
  else if (face.eyebrowRaised) col = [255, 140, 0];
  else if (face.mouthOpen)     col = [255, 220, 0];
  if (!col) return;

  // Vignettage colore sur les bords selon l'expression
  noStroke();
  for (let i = 0; i < 30; i += 2) {
    fill(col[0], col[1], col[2], 4);
    rect(i, i, CANVAS_W - i*2, CANVAS_H - i*2);
  }
}

// ─── Annonces flottantes (Generation, Combo) - elements creatifs ─────────────
function _drawAnnouncements() {
  if (!_announcements.length) return;
  textAlign(CENTER); textFont('monospace');
  for (let i = _announcements.length - 1; i >= 0; i--) {
    const a = _announcements[i];
    a.life--;
    a.y -= 0.7;
    if (a.life <= 0) { _announcements.splice(i, 1); continue; }

    const alpha = a.life > 30 ? 255 : (a.life / 30) * 255;
    const scale = a.life > 100 ? (1 + (120 - a.life) * 0.05) : 1.2;

    drawingContext.shadowBlur = 16;
    drawingContext.shadowColor = `rgba(${a.color.join(',')},${alpha/255})`;
    fill(a.color[0], a.color[1], a.color[2], alpha);
    textSize(22 * scale);
    text(a.text, CANVAS_W / 2, a.y);
    drawingContext.shadowBlur = 0;
  }
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

// ─── Ecran d'INTRO animé (3 secondes) ────────────────────────────────────────
function _drawIntroScreen() {
  // Fond semi-transparent qui s'eclaircit
  const fadeT = Math.min(_introTimer / 30, 1);
  fill(0, 0, 0, 180 * fadeT); noStroke();
  rect(0, 0, CANVAS_W, CANVAS_H);

  textAlign(CENTER); textFont('monospace');

  // Titre principal qui scale-in + glow pulsant
  const tProgress = Math.min(_introTimer / 60, 1);
  const easeT = 1 - Math.pow(1 - tProgress, 3); // ease-out cubic
  const titleSize = 70 * easeT;
  const pulse = 1 + Math.sin(_introTimer * 0.15) * 0.06;

  if (_introTimer > 5) {
    // GRIMACE en cyan
    drawingContext.shadowBlur = 30 * pulse;
    drawingContext.shadowColor = 'rgba(0,255,200,0.95)';
    fill(0, 255, 200);
    textSize(titleSize * pulse);
    text('GRIMACE', CANVAS_W / 2 - 10, CANVAS_H / 2 - 30);

    // RUN en rouge magenta
    drawingContext.shadowColor = 'rgba(255,40,110,0.95)';
    fill(255, 40, 110);
    text('RUN', CANVAS_W / 2 + 145, CANVAS_H / 2 - 30);
    drawingContext.shadowBlur = 0;
  }

  // Sous-titre qui apparait apres 1s
  if (_introTimer > 60) {
    const subT = Math.min((_introTimer - 60) / 30, 1);
    fill(255, 210, 0, 255 * subT);
    textSize(13);
    drawingContext.shadowBlur = 8; drawingContext.shadowColor = 'rgba(255,210,0,0.7)';
    text('NEURAL FACE RUNNER', CANVAS_W / 2, CANVAS_H / 2 + 20);
    drawingContext.shadowBlur = 0;
  }

  // Instructions qui apparaissent apres 1.8s
  if (_introTimer > 110) {
    const insT = Math.min((_introTimer - 110) / 30, 1);
    fill(180, 180, 220, 230 * insT);
    textSize(10);
    text('ML5 FACEMESH + NEURO-EVOLUTION', CANVAS_W / 2, CANVAS_H / 2 + 50);

    fill(120, 200, 255, 180 * insT);
    textSize(9);
    text('Bouche -> SAUT  |  Sourcils -> DASH  |  Sourire -> BOUCLIER', CANVAS_W / 2, CANVAS_H / 2 + 75);
    text('Clavier : ESPACE / FLECHE BAS / A', CANVAS_W / 2, CANVAS_H / 2 + 92);
  }

  // Compte a rebours dernier 1.5s
  if (_introTimer > 90) {
    const remaining = Math.ceil((180 - _introTimer) / 60);
    if (remaining > 0) {
      fill(255, 60, 110, 200);
      textSize(20);
      drawingContext.shadowBlur = 14;
      drawingContext.shadowColor = 'rgba(255,60,110,0.9)';
      text(`Demarrage dans ${remaining}...`, CANVAS_W / 2, CANVAS_H - 60);
      drawingContext.shadowBlur = 0;
    }
  }

  // Lignes decoratives synthwave
  if (_introTimer > 5) {
    stroke(0, 255, 200, 60); strokeWeight(1);
    for (let i = 0; i < 3; i++) {
      const ly = CANVAS_H / 2 - 80 + i * 4;
      line(60, ly, CANVAS_W - 60, ly);
    }
    for (let i = 0; i < 3; i++) {
      const ly = CANVAS_H / 2 + 110 + i * 4;
      stroke(255, 40, 110, 60);
      line(60, ly, CANVAS_W - 60, ly);
    }
    noStroke();
  }

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

// ─── Ecran GAME OVER avec glitch + animation score ───────────────────────────
function _drawGameOverScreen() {
  // Fond rouge sombre qui pulse
  const pulse = 0.5 + Math.sin(_gameOverTimer * 0.08) * 0.1;
  fill(60 * pulse, 5, 15, 200); noStroke();
  rect(0, 0, CANVAS_W, CANVAS_H);

  // Vignettage rouge sur les bords
  for (let i = 0; i < 60; i += 4) {
    fill(255, 20, 60, 4);
    rect(i, i, CANVAS_W - i*2, CANVAS_H - i*2);
  }

  textAlign(CENTER); textFont('monospace');

  // Glitch effect sur GAME OVER
  const glitchX = (Math.random() - 0.5) * 4;
  const glitchY = (Math.random() - 0.5) * 2;

  // Ombre rouge + cyan (effet RGB split)
  drawingContext.shadowBlur = 0;
  fill(0, 255, 200, 120); textSize(56);
  text('GAME OVER', CANVAS_W / 2 - 3, CANVAS_H / 2 - 70);
  fill(255, 40, 80, 120);
  text('GAME OVER', CANVAS_W / 2 + 3, CANVAS_H / 2 - 70);

  // Texte principal
  drawingContext.shadowBlur = 28;
  drawingContext.shadowColor = 'rgba(255,40,80,1)';
  fill(255, 60, 110);
  text('GAME OVER', CANVAS_W / 2 + glitchX, CANVAS_H / 2 - 70 + glitchY);
  drawingContext.shadowBlur = 0;

  // Score qui s'anime (count up)
  const finalScore = Math.floor(player.score / 10);
  const scoreReveal = Math.min(_gameOverTimer / 60, 1);
  const displayScore = Math.floor(finalScore * scoreReveal);

  fill(255, 210, 0);
  drawingContext.shadowBlur = 12; drawingContext.shadowColor = 'rgba(255,210,0,0.8)';
  textSize(22);
  text(`SCORE : ${displayScore}`, CANVAS_W / 2, CANVAS_H / 2 - 10);
  drawingContext.shadowBlur = 0;

  // Record
  fill(180, 180, 220); textSize(12);
  text(`Record : ${Math.floor(highScore / 10)}`, CANVAS_W / 2, CANVAS_H / 2 + 18);

  if (player.score >= highScore && highScore > 0 && _gameOverTimer > 60) {
    const recordPulse = 1 + Math.sin(_gameOverTimer * 0.2) * 0.15;
    fill(0, 255, 200);
    drawingContext.shadowBlur = 16;
    drawingContext.shadowColor = 'rgba(0,255,200,1)';
    textSize(16 * recordPulse);
    text('★ NOUVEAU RECORD ★', CANVAS_W / 2, CANVAS_H / 2 + 50);
    drawingContext.shadowBlur = 0;
  }

  // Generation IA atteinte
  if (_gameOverTimer > 90) {
    fill(140, 200, 255, 200);
    textSize(11);
    text(`IA Generation ${aiPop.generation}  |  Meilleur IA : ${Math.floor(aiPop.bestFit / 10)}`,
         CANVAS_W / 2, CANVAS_H / 2 + 80);
  }

  // Prompt clignotant
  if (_gameOverTimer > 120) {
    const blink = Math.floor(_gameOverTimer / 30) % 2 === 0;
    if (blink) {
      fill(255, 255, 255);
      textSize(13);
      text('ESPACE ou CLIC pour rejouer', CANVAS_W / 2, CANVAS_H / 2 + 115);
    }
  }

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

  // Export du meilleur cerveau en JSON (preuve d'engineering)
  document.getElementById('btn-export-brain')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    const brain = aiPop.bestBrain || aiPop.runners[0]?.brain;
    if (!brain) { alert('Aucun cerveau a exporter encore'); return; }
    const data = {
      meta: {
        project:    'GRIMACE RUN',
        generation: aiPop.generation,
        fitness:    aiPop.allTimeBest,
        date:       new Date().toISOString(),
      },
      brain: brain.toJSON(),
      historique: aiPop.history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grimace-brain-gen${aiPop.generation}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
