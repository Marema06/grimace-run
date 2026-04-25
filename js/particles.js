'use strict';

/**
 * Système de particules pour effets visuels cyberpunk
 *
 * Types d'effets :
 *  - crash()  : explosion neon quand une voiture meurt
 *  - spark()  : étincelles quand les capteurs détectent un mur proche
 *  - trail()  : trainée lumineuse derrière le champion
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  // Explosion quand une voiture meurt
  crash(x, y, isChampion = false) {
    const count = isChampion ? 28 : 10;
    const color = isChampion ? [0, 255, 200] : [80, 220, 100];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (isChampion ? 5 : 3) + 1;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.025 + (isChampion ? 0.012 : 0.025),
        size: Math.random() * (isChampion ? 5 : 3) + 2,
        color,
        type: 'spark'
      });
    }

    // Anneau d'onde de choc pour le champion
    if (isChampion) {
      this.particles.push({ x, y, life: 1.0, decay: 0.04, radius: 5, color: [0, 255, 200], type: 'ring' });
    }
  }

  // Étincelles sur les murs (appelé depuis le champion)
  wallSpark(x, y, sensorAngle) {
    if (Math.random() > 0.3) return;
    this.particles.push({
      x, y,
      vx: Math.cos(sensorAngle + Math.PI + (Math.random() - 0.5)) * (Math.random() * 2 + 0.5),
      vy: Math.sin(sensorAngle + Math.PI + (Math.random() - 0.5)) * (Math.random() * 2 + 0.5),
      life: 1.0,
      decay: 0.08 + Math.random() * 0.06,
      size: Math.random() * 2 + 1,
      color: [255, Math.floor(Math.random() * 100 + 100), 0],
      type: 'spark'
    });
  }

  // Checkpoint franchi : flash court
  checkpointFlash(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * (Math.random() * 2 + 0.5),
        vy: Math.sin(angle) * (Math.random() * 2 + 0.5),
        life: 1.0,
        decay: 0.06,
        size: Math.random() * 3 + 2,
        color: [255, 230, 0],
        type: 'spark'
      });
    }
  }

  update() {
    for (const p of this.particles) {
      if (p.type === 'ring') {
        p.radius += 5;
        p.life -= p.decay;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= p.decay;
      }
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw(p) {
    for (const pt of this.particles) {
      const alpha = pt.life * 255;

      if (pt.type === 'ring') {
        p.noFill();
        p.stroke(pt.color[0], pt.color[1], pt.color[2], alpha * 0.7);
        p.strokeWeight(2);
        p.drawingContext.shadowBlur = 10;
        p.drawingContext.shadowColor = `rgba(${pt.color[0]},${pt.color[1]},${pt.color[2]},0.6)`;
        p.circle(pt.x, pt.y, pt.radius * 2);
        p.drawingContext.shadowBlur = 0;
      } else {
        p.noStroke();
        p.fill(pt.color[0], pt.color[1], pt.color[2], alpha);
        p.drawingContext.shadowBlur = 6;
        p.drawingContext.shadowColor = `rgba(${pt.color[0]},${pt.color[1]},${pt.color[2]},0.8)`;
        p.circle(pt.x, pt.y, pt.size * pt.life);
        p.drawingContext.shadowBlur = 0;
      }
    }
  }
}
