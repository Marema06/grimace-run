'use strict';

// Types d'obstacles
const OBS = { WALL: 'WALL', BAR: 'BAR', PIT: 'PIT' };

class Obstacle {
  constructor(x, type, speed, groundY, canvasH) {
    this.x       = x;
    this.type    = type;
    this.speed   = speed;
    this.groundY = groundY;
    this.canvasH = canvasH;
    this.alive   = true;
    this.passed  = false; // pour le scoring IA

    switch (type) {
      case OBS.WALL: this.w = 24; this.h = 62; break;
      case OBS.BAR:  this.w = 28; this.barH = 108; break; // barre descendant du haut
      case OBS.PIT:  this.w = 88; break;
    }
  }

  update() {
    this.x -= this.speed;
    if (this.x < -200) this.alive = false;
  }

  // Collision avec une entité (player ou AIRunner)
  // dashing = true → hitbox réduite (accroupi)
  collides(entity, dashing = false) {
    const eTop    = dashing ? entity.groundY - 24 : entity.top;
    const eBottom = entity.bottom;
    const eLeft   = entity.left;
    const eRight  = entity.right;

    switch (this.type) {
      case OBS.WALL: {
        const wallTop = this.groundY - this.h;
        return eRight > this.x && eLeft < this.x + this.w &&
               eBottom > wallTop && eTop < this.groundY;
      }
      case OBS.BAR: {
        // Barre suspendue depuis le haut — collision si tête dépasse la barre
        return eRight > this.x && eLeft < this.x + this.w && eTop < this.barH;
      }
      case OBS.PIT: {
        // Trou dans le sol — collision si au sol et au-dessus du trou
        return eBottom >= this.groundY - 2 &&
               eRight > this.x + 4 && eLeft < this.x + this.w - 4;
      }
    }
    return false;
  }

  draw(p) {
    p.noStroke();
    switch (this.type) {
      case OBS.WALL: {
        // Mur rouge néon
        p.drawingContext.shadowBlur = 14;
        p.drawingContext.shadowColor = 'rgba(255,40,80,0.9)';
        p.fill(220, 35, 70);
        p.rect(this.x, this.groundY - this.h, this.w, this.h, 2);
        // Rayures d'avertissement
        p.fill(255, 210, 0, 140);
        for (let s = 0; s < 3; s++) {
          p.rect(this.x + 3, this.groundY - this.h + s * (this.h / 3) + 5, this.w - 6, 6, 2);
        }
        break;
      }
      case OBS.BAR: {
        // Barre suspendue orange
        p.drawingContext.shadowBlur = 14;
        p.drawingContext.shadowColor = 'rgba(255,140,0,0.9)';
        p.fill(230, 120, 0);
        p.rect(this.x, 0, this.w, this.barH, 0, 0, 4, 4);
        p.fill(255, 210, 0, 120);
        for (let s = 0; s < 3; s++) {
          if (s % 2 === 0) p.rect(this.x + 3, s * (this.barH / 3) + 3, this.w - 6, this.barH / 3 - 6, 2);
        }
        break;
      }
      case OBS.PIT: {
        // Trou violet — effacer le sol + rebords lumineux
        p.drawingContext.shadowBlur = 0;
        p.fill(6, 4, 18);
        p.rect(this.x, this.groundY, this.w, this.canvasH - this.groundY + 10);
        // Rebords
        p.drawingContext.shadowBlur = 12;
        p.drawingContext.shadowColor = 'rgba(140,0,255,0.9)';
        p.fill(130, 0, 255);
        p.rect(this.x - 3, this.groundY - 6, 8, 12, 2);
        p.rect(this.x + this.w - 5, this.groundY - 6, 8, 12, 2);
        break;
      }
    }
    p.drawingContext.shadowBlur = 0;
  }
}

// ─── Gestionnaire d'obstacles ─────────────────────────────────────────────────
class ObstacleManager {
  constructor(groundY, canvasH, canvasW) {
    this.groundY   = groundY;
    this.canvasH   = canvasH;
    this.canvasW   = canvasW;
    this.obstacles = [];
    this.speed     = 4.2;
    this.spawnIn   = 90;   // frames avant prochain spawn
    this.timer     = 60;   // délai initial
    this.frame     = 0;
  }

  update() {
    this.frame++;

    // Difficulté progressive
    if (this.frame % 550 === 0) {
      this.speed   = Math.min(9.5, this.speed + 0.45);
      this.spawnIn = Math.max(55, this.spawnIn - 4);
    }

    // Spawn
    if (--this.timer <= 0) {
      this._spawn();
      this.timer = this.spawnIn + Math.floor(Math.random() * 30);
    }

    for (const o of this.obstacles) o.update();
    this.obstacles = this.obstacles.filter(o => o.alive);
  }

  _spawn() {
    const types = [OBS.WALL, OBS.BAR, OBS.PIT];
    const t = types[Math.floor(Math.random() * types.length)];
    this.obstacles.push(new Obstacle(this.canvasW + 40, t, this.speed, this.groundY, this.canvasH));
  }

  // Prochain obstacle devant playerX
  getNext(px, offset = 0) {
    const ahead = this.obstacles.filter(o => o.x > px).sort((a, b) => a.x - b.x);
    return ahead[offset] || null;
  }

  checkCollision(entity, dashing = false) {
    for (const o of this.obstacles) {
      if (o.collides(entity, dashing)) return o;
    }
    return null;
  }

  draw(p) {
    // Dessiner les trous en premier (fond), puis les obstacles sur le dessus
    for (const o of this.obstacles) if (o.type === OBS.PIT) o.draw(p);
    for (const o of this.obstacles) if (o.type !== OBS.PIT) o.draw(p);
  }

  reset() {
    this.obstacles = [];
    this.speed     = 4.2;
    this.spawnIn   = 90;
    this.timer     = 80;
    this.frame     = 0;
  }
}
