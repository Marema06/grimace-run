'use strict';

/**
 * Runner IA contrôlé par un réseau de neurones
 * Entrées (6) : [dist_prochain, type_prochain, hauteur_prochain,
 *                dist_deuxième, hauteur_actuelle, vitesse_verticale]
 * Sorties (2) : [sauter, dasher]
 */
class AIRunner {
  constructor(groundY, brain = null) {
    this.groundY = groundY;
    this.x       = 90;   // légèrement derrière le joueur (x=150)
    this.y       = groundY;
    this.vy      = 0;

    this.GRAVITY    = 0.55;
    this.JUMP_FORCE = -13;
    this.W = 18; this.H = 40;

    this.alive      = true;
    this.fitness    = 0;
    this.dashTimer  = 0;
    this.doubleJump = false;

    // Cooldown pour éviter les sauts répétés au même frame
    this._jumpCD = 0;
    this._dashCD = 0;

    this.brain = brain || new NeuralNet(6, [8], 2);
  }

  get top()    { return this.y - (this.dashTimer > 0 ? 22 : this.H); }
  get bottom() { return this.y; }
  get left()   { return this.x - this.W / 2; }
  get right()  { return this.x + this.W / 2; }

  update(obstacleManager) {
    if (!this.alive) return;

    // ── Inputs NN ────────────────────────────────────────────────────────────
    const MAX_DIST = 650;
    const next  = obstacleManager.getNext(this.x, 0);
    const next2 = obstacleManager.getNext(this.x, 1);

    const typeMap = { WALL: 0, BAR: 0.5, PIT: 1 };

    const inputs = [
      next  ? Math.min((next.x  - this.x) / MAX_DIST, 1) : 1,
      next  ? (typeMap[next.type]  || 0)                  : 0,
      next  ? ((next.h || next.barH || 0) / 120)          : 0,
      next2 ? Math.min((next2.x - this.x) / MAX_DIST, 1) : 1,
      (this.groundY - this.y) / 220,
      Math.max(-1, Math.min(1, this.vy / 15)),
    ];

    // On garde inputs et activations pour le visualiseur
    this.lastInputs = inputs;
    const result = this.brain.predictWithActivations
      ? this.brain.predictWithActivations(inputs)
      : { outputs: this.brain.predict(inputs), activations: [inputs] };
    this.lastActivations = result.activations;
    const [jumpOut, dashOut] = result.outputs;
    this.lastOutputs = [jumpOut, dashOut];

    // ── Actions ──────────────────────────────────────────────────────────────
    if (this._jumpCD > 0) this._jumpCD--;
    if (this._dashCD > 0) this._dashCD--;

    if (jumpOut > 0.45 && this._jumpCD === 0) {
      if (this.y >= this.groundY - 2) {
        this.vy = this.JUMP_FORCE;
        this.doubleJump = true;
        this._jumpCD = 18;
      } else if (this.doubleJump) {
        this.vy = this.JUMP_FORCE * 0.72;
        this.doubleJump = false;
        this._jumpCD = 18;
      }
    }

    if (dashOut > 0.45 && this._dashCD === 0) {
      this.dashTimer = 30;
      this._dashCD   = 35;
    }

    // ── Physique ─────────────────────────────────────────────────────────────
    if (this.dashTimer > 0) { this.dashTimer--; this.vy += this.GRAVITY * 0.25; }
    else                    { this.vy += this.GRAVITY; }

    this.y += this.vy;
    if (this.y >= this.groundY) {
      this.y = this.groundY; this.vy = 0; this.doubleJump = false;
      if (!this.dashTimer) {}
    }

    // ── Collision ────────────────────────────────────────────────────────────
    if (obstacleManager.checkCollision(this, this.dashTimer > 0)) {
      this.alive = false;
      return;
    }

    this.fitness++;
  }

  draw(p) {
    if (!this.alive) return;
    const bodyH = this.dashTimer > 0 ? 22 : this.H;
    p.noStroke(); p.noFill();
    p.drawingContext.shadowBlur = 7;
    p.drawingContext.shadowColor = 'rgba(140,60,255,0.6)';
    p.fill(150, 70, 255, 75);
    p.rect(this.x - this.W / 2, this.y - bodyH, this.W, bodyH * 0.68, 3);
    p.circle(this.x, this.y - bodyH - 10, 17);
    p.drawingContext.shadowBlur = 0;
  }
}

// ─── Population + algorithme génétique ────────────────────────────────────────
class AIPopulation {
  constructor(groundY, config) {
    this.groundY    = groundY;
    this.config     = config;
    this.generation = 1;
    this.runners    = [];
    this.bestFit    = 0;
    this.bestBrain  = null;
    this.allTimeBest = 0;
    // Historique pour le graphique d'apprentissage
    this.history = []; // { gen, best, avg, max }
    this._spawn(false);
  }

  // Recupere le runner vivant le plus performant (pour visualiser son cerveau)
  getBestAlive() {
    let best = null;
    for (const r of this.runners) {
      if (r.alive && (!best || r.fitness > best.fitness)) best = r;
    }
    return best;
  }

  _spawn(evolve) {
    const { size, mutationRate, mutationStrength } = this.config;

    if (evolve && this.runners.length) {
      const sorted = [...this.runners].sort((a, b) => b.fitness - a.fitness);
      const best   = sorted[0];
      if (best.fitness > this.bestFit) {
        this.bestFit   = best.fitness;
        this.bestBrain = best.brain.copy();
      }
      this.allTimeBest = Math.max(this.allTimeBest, best.fitness);

      // Sauvegarde des stats de cette generation pour le graphique
      const fits = this.runners.map(r => r.fitness);
      const avg  = fits.reduce((a, b) => a + b, 0) / fits.length;
      this.history.push({
        gen:  this.generation,
        best: best.fitness,
        avg:  Math.floor(avg),
        max:  this.allTimeBest,
      });
      // On garde les 60 dernieres generations
      if (this.history.length > 60) this.history.shift();
    }

    this.runners = [];
    for (let i = 0; i < size; i++) {
      let brain;
      if (!evolve || !this.bestBrain) {
        brain = new NeuralNet(6, [8], 2);
      } else if (i === 0) {
        brain = this.bestBrain.copy(); // élite intact
      } else if (i < 3 && this.runners.length > 0) {
        brain = this.bestBrain.copy();
        brain.mutate(mutationRate * 0.3, mutationStrength * 0.3); // mutation douce
      } else {
        brain = this.bestBrain.copy();
        brain.mutate(mutationRate, mutationStrength);
      }
      this.runners.push(new AIRunner(this.groundY, brain));
    }
  }

  update(obstacleManager) {
    for (const r of this.runners) if (r.alive) r.update(obstacleManager);
    if (!this.runners.some(r => r.alive)) {
      this._spawn(true);
      this.generation++;
      return true; // nouvelle génération
    }
    return false;
  }

  getAliveCount() { return this.runners.filter(r => r.alive).length; }

  draw(p) { for (const r of this.runners) r.draw(p); }

  reset() {
    this.generation = 1;
    this.bestFit    = 0;
    this.bestBrain  = null;
    this.allTimeBest = 0;
    this._spawn(false);
  }
}
