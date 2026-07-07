function pickRandom(min, max) {
  return min + Math.random() * (max - min);
}

function findExpr(names, patterns) {
  for (const re of patterns) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return null;
}

function findAllExprs(names, pattern) {
  return names.filter((n) => pattern.test(n));
}

function smoothToward(current, target, dtSec, tauSec) {
  const k = tauSec <= 0 ? 1 : 1 - Math.exp(-dtSec / tauSec);
  return current + (target - current) * k;
}

/**
 * Procedural blink, eye-look saccades, and eyebrow micro-movements via VRM expressions.
 */
export class FacialIdleController {
  constructor(vrm, options = {}) {
    this.vrm = vrm;
    this.em = vrm?.expressionManager;
    this.enabled = options.enabled !== false;

    const names = this.em?.expressionMap ? Object.keys(this.em.expressionMap) : [];

    this.expr = {
      blink: findExpr(names, [/^blink$/i]),
      blinkLeft: findExpr(names, [/^blinkLeft$/i]),
      blinkRight: findExpr(names, [/^blinkRight$/i]),
      lookUp: findExpr(names, [/^lookUp$/i]),
      lookDown: findExpr(names, [/^lookDown$/i]),
      lookLeft: findExpr(names, [/^lookLeft$/i]),
      lookRight: findExpr(names, [/^lookRight$/i]),
      brows: findAllExprs(names, /brow/i),
    };

    this.managed = [
      this.expr.blink,
      this.expr.blinkLeft,
      this.expr.blinkRight,
      this.expr.lookUp,
      this.expr.lookDown,
      this.expr.lookLeft,
      this.expr.lookRight,
      ...this.expr.brows,
    ].filter(Boolean);

    this.values = Object.fromEntries(this.managed.map((n) => [n, 0]));
    this.targets = Object.fromEntries(this.managed.map((n) => [n, 0]));

    this.smoothSec = (options.smoothMs ?? 100) / 1000;
    this.eyeIntensity = options.eyeLookIntensity ?? 0.45;
    this.browIntensity = options.browIntensity ?? 0.35;
    this.blinkIntervalMin = options.blinkIntervalMin ?? 2.5;
    this.blinkIntervalMax = options.blinkIntervalMax ?? 6;

    this._blinkCooldown = pickRandom(this.blinkIntervalMin, this.blinkIntervalMax);
    this._blinkProgress = -1;
    this._blinkDuration = 0.13;

    this._eyeHold = pickRandom(1.5, 3.5);
    this._browHold = pickRandom(2, 4.5);
    this._time = 0;
    this._browPhaseOffset = Math.random() * Math.PI * 2;
  }

  hasExpressions() {
    return this.managed.length > 0;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.reset();
  }

  reset() {
    for (const name of this.managed) {
      this.values[name] = 0;
      this.targets[name] = 0;
      this.em?.setValue(name, 0);
    }
  }

  _setLookTarget(yaw, pitch) {
    const { lookLeft, lookRight, lookUp, lookDown } = this.expr;
    const i = this.eyeIntensity;

    if (lookLeft) this.targets[lookLeft] = yaw < 0 ? Math.min(1, -yaw * i) : 0;
    if (lookRight) this.targets[lookRight] = yaw > 0 ? Math.min(1, yaw * i) : 0;
    if (lookUp) this.targets[lookUp] = pitch > 0 ? Math.min(1, pitch * i) : 0;
    if (lookDown) this.targets[lookDown] = pitch < 0 ? Math.min(1, -pitch * i) : 0;
  }

  _clearLookTargets() {
    const { lookLeft, lookRight, lookUp, lookDown } = this.expr;
    if (lookLeft) this.targets[lookLeft] = 0;
    if (lookRight) this.targets[lookRight] = 0;
    if (lookUp) this.targets[lookUp] = 0;
    if (lookDown) this.targets[lookDown] = 0;
  }

  _updateBlink(dt) {
    const { blink, blinkLeft, blinkRight } = this.expr;
    if (!blink && !blinkLeft && !blinkRight) return;

    if (this._blinkProgress >= 0) {
      this._blinkProgress += dt;
      const t = this._blinkProgress / this._blinkDuration;
      const w = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const v = Math.max(0, Math.min(1, w));

      if (blink) this.targets[blink] = v;
      if (blinkLeft) this.targets[blinkLeft] = v;
      if (blinkRight) this.targets[blinkRight] = v;

      if (this._blinkProgress >= this._blinkDuration) {
        this._blinkProgress = -1;
        if (blink) this.targets[blink] = 0;
        if (blinkLeft) this.targets[blinkLeft] = 0;
        if (blinkRight) this.targets[blinkRight] = 0;
        this._blinkCooldown = pickRandom(this.blinkIntervalMin, this.blinkIntervalMax);
      }
      return;
    }

    this._blinkCooldown -= dt;
    if (this._blinkCooldown <= 0) {
      this._blinkProgress = 0;
    }
  }

  _updateEyeLook(dt) {
    const { lookLeft, lookRight, lookUp, lookDown } = this.expr;
    if (!lookLeft && !lookRight && !lookUp && !lookDown) return;

    this._eyeHold -= dt;
    if (this._eyeHold > 0) return;

    if (Math.random() < 0.3) {
      this._clearLookTargets();
    } else {
      const yaw = pickRandom(-1, 1);
      const pitch = pickRandom(-0.55, 0.35);
      this._setLookTarget(yaw, pitch);
    }

    this._eyeHold = pickRandom(1.2, 3.8);
  }

  _updateBrows(dt) {
    if (!this.expr.brows.length) return;

    this._browHold -= dt;
    if (this._browHold <= 0) {
      for (const name of this.expr.brows) {
        this.targets[name] = 0;
      }

      const count = Math.random() < 0.35 ? 0 : (Math.random() < 0.55 ? 1 : 2);
      const shuffled = [...this.expr.brows].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count && i < shuffled.length; i++) {
        this.targets[shuffled[i]] = pickRandom(0.12, this.browIntensity);
      }

      this._browHold = pickRandom(1.8, 4.5);
    }

    const wave = 0.06 * Math.sin(this._time * 0.7 + this._browPhaseOffset);
    for (const name of this.expr.brows) {
      const base = this.targets[name] ?? 0;
      this.targets[name] = Math.min(1, Math.max(0, base + wave));
    }
  }

  update(dtSec) {
    if (!this.enabled || !this.em || !this.managed.length) return;

    this._time += dtSec;
    this._updateBlink(dtSec);
    this._updateEyeLook(dtSec);
    this._updateBrows(dtSec);

    for (const name of this.managed) {
      const next = smoothToward(
        this.values[name],
        this.targets[name],
        dtSec,
        this.smoothSec,
      );
      if (Math.abs(next - this.values[name]) > 0.0001) {
        this.values[name] = next;
        this.em.setValue(name, next);
      }
    }
  }
}
