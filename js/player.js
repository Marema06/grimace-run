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

    // Aura neon autour du joueur (pulsation)
    const pulse = 1 + Math.sin(p.frameCount * 0.15) * 0.15;
    p.noStroke();
    p.drawingContext.shadowBlur = 25 * pulse;
    p.drawingContext.shadowColor = dashing ? 'rgba(255,140,0,0.7)' : 'rgba(0,220,255,0.7)';
    p.fill(dashing ? p.color(255,140,0,30) : p.color(0,220,255,30));
    p.ellipse(this.x, this.y - bodyH/2, this.W * 2.4 * pulse, bodyH * 1.8 * pulse);
    p.drawingContext.shadowBlur = 0;

    // Trail dash (traînée bleue)
    for (let i = 0; i < this.trail.length; i++) {
      const a = (i / this.trail.length) * 100;
      p.fill(0, 180, 255, a);
      p.rect(this.trail[i].x - this.W / 2, this.trail[i].y - bodyH, this.W, bodyH * 0.6, 3);
    }

    // Poussiere sous les pieds quand au sol
    if (!dashing && this.y >= this.groundY - 2 && p.frameCount % 4 === 0) {
      for (let i = 0; i < 2; i++) {
        const dx = -10 - Math.random() * 20;
        p.fill(0, 255, 200, 80 - Math.random() * 40);
        p.circle(this.x + dx, this.y - 2 + Math.random() * 4, 3 + Math.random() * 3);
      }
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

    // ── Tete qui MIME le visage du joueur en temps reel via FaceMesh ─────────
    p.circle(0, -bodyH - 13, 22);

    const headY     = -bodyH - 13;
    const faceLive  = typeof face !== 'undefined' && face.active;

    // Sourcils qui se levent en temps reel
    if (faceLive) {
      const browLift = face.eyebrowRaised ? -3 : 0;
      p.stroke(8, 8, 20); p.strokeWeight(2);
      p.line(-8, headY - 4 + browLift, -3, headY - 5 + browLift);
      p.line( 3, headY - 5 + browLift,  8, headY - 4 + browLift);
      p.noStroke();
    }

    // Yeux
    p.fill(8, 8, 20);
    const eyeY    = headY - 2;
    const eyeLift = faceLive && face.eyebrowRaised ? -2 : 0;
    if (faceLive && face.smiling) {
      // Yeux plisses (sourire)
      p.noFill(); p.stroke(8, 8, 20); p.strokeWeight(2);
      p.arc(-5, eyeY + 1, 6, 5, Math.PI, 0);
      p.arc( 5, eyeY + 1, 6, 5, Math.PI, 0);
      p.noStroke(); p.fill(8, 8, 20);
    } else {
      p.circle(-5, eyeY + eyeLift, 5);
      p.circle( 5, eyeY + eyeLift, 5);
    }

    // Bouche qui mime
    const mouthY = headY + 5;
    if (faceLive && face.mouthWide) {
      // Grande bouche ouverte (super saut) - rouge interieur
      p.fill(180, 20, 50);
      p.ellipse(0, mouthY, 10, 10);
      p.fill(8, 8, 20);
      p.ellipse(0, mouthY + 1, 7, 7);
    } else if (faceLive && face.mouthOpen) {
      // Bouche ouverte (saut)
      p.fill(80, 10, 25);
      p.ellipse(0, mouthY, 8, 6);
    } else if (faceLive && face.smiling) {
      // Sourire
      p.noFill(); p.stroke(8, 8, 20); p.strokeWeight(2);
      p.arc(0, mouthY - 1, 11, 8, 0, Math.PI);
      p.noStroke();
    } else {
      // Bouche neutre (trait simple)
      p.rect(-3, mouthY, 6, 1.5, 1);
    }

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
