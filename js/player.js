'use strict';

class Player {
  constructor(x, groundY) {
    this.x       = x;
    this.groundY = groundY;
    this.y       = groundY;
    this.vy      = 0;

    this.GRAVITY         = 0.55;
    this.JUMP_FORCE      = -13;
    this.SUPER_JUMP_FORCE = -18;

    // Hitbox normale
    this.W = 26;
    this.H = 46;

    this.state           = 'RUNNING'; // RUNNING | JUMPING | DASHING | DEAD
    this.shielded        = false;
    this.shieldTimer     = 0;
    this.dashTimer       = 0;
    this.doubleJump      = false;
    this.invincibleTimer = 0;
    this.lives           = 3;
    this.score           = 0;

    // Animation jambes
    this.legPhase = 0;

    // Trail pour le dash
    this.trail = [];
  }

  // Bornes hitbox (bas = sol level quand à terre)
  get top()    { return this.y - (this.dashTimer > 0 ? 24 : this.H); }
  get bottom() { return this.y; }
  get left()   { return this.x - this.W / 2; }
  get right()  { return this.x + this.W / 2; }

  jump(superJump = false) {
    if (this.state === 'DEAD') return false;
    if (this.y >= this.groundY - 2) {
      this.vy = superJump ? this.SUPER_JUMP_FORCE : this.JUMP_FORCE;
      this.state = 'JUMPING';
      this.doubleJump = true;
      return true;
    } else if (this.doubleJump && !superJump) {
      this.vy = this.JUMP_FORCE * 0.75;
      this.doubleJump = false;
      return true;
    }
    return false;
  }

  dash() {
    if (this.state === 'DEAD' || this.dashTimer > 0) return false;
    this.dashTimer = 30;
    return true;
  }

  activateShield() {
    if (this.state === 'DEAD' || this.shielded) return false;
    this.shielded = true;
    this.shieldTimer = 110;
    return true;
  }

  hit() {
    if (this.shielded || this.invincibleTimer > 0 || this.state === 'DEAD') return false;
    this.lives--;
    this.invincibleTimer = 80;
    if (this.lives <= 0) this.state = 'DEAD';
    return true;
  }

  update() {
    if (this.state === 'DEAD') return;

    // Timers
    if (this.shieldTimer  > 0) { this.shieldTimer--;  if (!this.shieldTimer) this.shielded = false; }
    if (this.dashTimer    > 0) { this.dashTimer--;     if (!this.dashTimer && this.y >= this.groundY - 2) this.state = 'RUNNING'; }
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    // Physique
    this.vy += this.dashTimer > 0 ? this.GRAVITY * 0.25 : this.GRAVITY;
    this.y  += this.vy;

    if (this.y >= this.groundY) {
      this.y  = this.groundY;
      this.vy = 0;
      if (!this.dashTimer) this.state = 'RUNNING';
      this.doubleJump = false;
    }

    // Animation jambes
    if (this.state === 'RUNNING') this.legPhase += 0.18;

    // Trail dash
    if (this.dashTimer > 0) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 7) this.trail.shift();
    } else {
      if (this.trail.length) this.trail.shift();
    }

    this.score++;
  }

  draw(p) {
    if (this.state === 'DEAD') return;

    const dashing  = this.dashTimer > 0;
    const bodyH    = dashing ? 24 : this.H;
    const blinking = this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 6) % 2 === 0;
    if (blinking) return;

    // Trail dash (traînée bleue)
    p.noStroke();
    for (let i = 0; i < this.trail.length; i++) {
      const a = (i / this.trail.length) * 100;
      p.fill(0, 180, 255, a);
      p.rect(this.trail[i].x - this.W / 2, this.trail[i].y - bodyH, this.W, bodyH * 0.6, 3);
    }

    p.push();
    p.translate(this.x, this.y);
    if (dashing) p.rotate(-0.25);

    // Bouclier
    if (this.shielded) {
      p.drawingContext.shadowBlur = 22;
      p.drawingContext.shadowColor = 'rgba(255,210,0,0.9)';
      p.noFill(); p.stroke(255, 210, 0, 200); p.strokeWeight(2.5);
      p.circle(0, -bodyH / 2, this.W + 22);
      p.drawingContext.shadowBlur = 0;
    }

    const col = dashing ? [255, 140, 0] : [0, 220, 255];
    p.drawingContext.shadowBlur = 14;
    p.drawingContext.shadowColor = `rgba(${col[0]},${col[1]},${col[2]},0.85)`;
    p.fill(...col);
    p.noStroke();

    // Corps
    p.rect(-this.W / 2, -bodyH, this.W, bodyH * 0.68, 4);

    // Tête
    p.circle(0, -bodyH - 13, 22);

    // Yeux
    p.fill(8, 8, 20);
    p.circle(-5, -bodyH - 15, 5);
    p.circle(5,  -bodyH - 15, 5);

    // Jambes (uniquement quand en course)
    if (!dashing) {
      const l1 = Math.sin(this.legPhase) * 0.45;
      const l2 = Math.sin(this.legPhase + Math.PI) * 0.45;
      p.stroke(...col, 200); p.strokeWeight(5); p.noFill();
      p.line(-5, 0, -5 + Math.sin(l1) * 14, 14);
      p.line( 5, 0,  5 + Math.sin(l2) * 14, 14);
    }

    p.drawingContext.shadowBlur = 0;
    p.pop();

    // Vies (coeurs)
    this._drawLives(p);
  }

  _drawLives(p) {
    const hx0 = this.x - 28, hy = this.groundY + 18;
    for (let i = 0; i < 3; i++) {
      const hx = hx0 + i * 22;
      const c  = i < this.lives ? [255, 60, 110] : [50, 50, 70];
      p.fill(...c); p.noStroke();
      p.ellipse(hx - 4, hy, 10, 9);
      p.ellipse(hx + 4, hy, 10, 9);
      p.triangle(hx - 8, hy + 2, hx + 8, hy + 2, hx, hy + 11);
    }
  }
}
