export const DEFAULT_AVATAR = {
  cameraX: 0,
  cameraY: 1.3,
  cameraZ: 1.6,
  targetX: 0,
  targetY: 1.42,
  targetZ: 0,
};

export function normalizeAvatar(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    cameraX: num(a.cameraX, DEFAULT_AVATAR.cameraX),
    cameraY: num(a.cameraY, DEFAULT_AVATAR.cameraY),
    cameraZ: num(a.cameraZ, DEFAULT_AVATAR.cameraZ),
    targetX: num(a.targetX, DEFAULT_AVATAR.targetX),
    targetY: num(a.targetY, DEFAULT_AVATAR.targetY),
    targetZ: num(a.targetZ, DEFAULT_AVATAR.targetZ),
  };
}

export const DEFAULT_LIPSYNC = {
  exaggerate: 1,
  msPerPhone: 120,
  crossfadeMs: 50,
  blendshapes: {},
};

export const DEFAULT_LIGHTING = {
  hemisphereIntensity: 1.6,
  keyLightIntensity: 1.25,
  fillLightIntensity: 0.5,
  exposure: 1.35,
};

export function normalizeLighting(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    hemisphereIntensity: num(l.hemisphereIntensity, 0, 4, DEFAULT_LIGHTING.hemisphereIntensity),
    keyLightIntensity: num(l.keyLightIntensity, 0, 4, DEFAULT_LIGHTING.keyLightIntensity),
    fillLightIntensity: num(l.fillLightIntensity, 0, 4, DEFAULT_LIGHTING.fillLightIntensity),
    exposure: num(l.exposure, 0.4, 3, DEFAULT_LIGHTING.exposure),
  };
}

export function normalizeLipsync(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    exaggerate: num(l.exaggerate, 0.2, 3, DEFAULT_LIPSYNC.exaggerate),
    msPerPhone: num(l.msPerPhone, 40, 400, DEFAULT_LIPSYNC.msPerPhone),
    crossfadeMs: num(l.crossfadeMs, 0, 200, DEFAULT_LIPSYNC.crossfadeMs),
    blendshapes: l.blendshapes && typeof l.blendshapes === 'object' ? l.blendshapes : {},
  };
}

/**
 * Lightweight avatar stub for legacy WebViews (Chrome 58 / MediaTek).
 * The 3D VRM renderer is skipped; idle video mode remains available.
 */
export class TommyAvatar {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options || {};
    this.loaded = false;
    this._backgroundUrl = null;
  }

  async load() {
    this.loaded = true;
    if (this.canvas) this.canvas.style.display = 'none';
    return this;
  }

  async setBackgroundUrl(url) {
    this._backgroundUrl = url || null;
  }

  setLighting() {}

  setLipsync() {}

  setBlendshapes() {}

  playAnimation() {
    return Promise.resolve();
  }

  stopAnimation() {}

  setCamera() {}

  getCamera() {
    return normalizeAvatar(this.options.avatar);
  }

  saveCamera() {
    return normalizeAvatar(this.options.avatar);
  }

  dispose() {
    this.loaded = false;
  }
}
