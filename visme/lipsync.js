import { textToPhonemeTimeline } from "./phonetics.js";

export function smoothMorphTowardTargets(morphMeshes, target22, dtSec, tauMs) {
  const tauSec = tauMs / 1000;
  const k = tauSec <= 0 ? 1 : 1 - Math.exp(-dtSec / tauSec);
  for (const mesh of morphMeshes) {
    for (let i = 0; i < 22; i++) {
      const mi = mesh.morphTargetDictionary[String(i)];
      if (mi === undefined) continue;
      const cur = mesh.morphTargetInfluences[mi];
      mesh.morphTargetInfluences[mi] = cur + (target22[i] - cur) * k;
    }
  }
}

export function clearBlend(morphMeshes) {
  for (const mesh of morphMeshes) {
    for (let i = 0; i < 22; i++) {
      const mi = mesh.morphTargetDictionary[String(i)];
      if (mi !== undefined) mesh.morphTargetInfluences[mi] = 0;
    }
  }
}

export function scaleTimeline(timeline, targetDurationMs) {
  if (!timeline.length || targetDurationMs <= 0) return timeline;
  const baseDuration = timeline[timeline.length - 1].end;
  if (baseDuration <= 0) return timeline;
  const scale = targetDurationMs / baseDuration;
  return timeline.map((entry) => ({
    ...entry,
    start: entry.start * scale,
    end: entry.end * scale,
  }));
}

export class LipsyncPlayer {
  constructor(morphMeshes, options = {}) {
    this.morphMeshes = morphMeshes;
    this.exaggerate = options.exaggerate ?? 1;
    this.crossfadeMs = options.crossfadeMs ?? 50;
    this.msPerPhone = options.msPerPhone ?? 120;
    this.active = false;
    this.timeline = [];
    this.target22 = new Array(22).fill(0);
    this.lastStepT = 0;
  }

  setText(text, durationMs) {
    const trimmed = text.trim();
    if (!trimmed || !this.morphMeshes.length) {
      this.timeline = [];
      return;
    }
    const base = textToPhonemeTimeline(trimmed, this.msPerPhone);
    this.timeline = durationMs > 0 ? scaleTimeline(base, durationMs) : base;
  }

  start() {
    this.active = true;
    this.lastStepT = performance.now();
  }

  stop() {
    this.active = false;
    this.timeline = [];
    clearBlend(this.morphMeshes);
  }

  update(elapsedMs) {
    if (!this.active || !this.morphMeshes.length) return;

    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastStepT) / 1000);
    this.lastStepT = now;

    for (let i = 0; i < 22; i++) this.target22[i] = 0;

    if (this.timeline.length) {
      let activeEntry = null;
      for (const entry of this.timeline) {
        if (elapsedMs >= entry.start && elapsedMs < entry.end) {
          activeEntry = entry;
          break;
        }
      }
      if (activeEntry) {
        this.target22[activeEntry.blendId] = this.exaggerate;
      }
    }

    smoothMorphTowardTargets(this.morphMeshes, this.target22, dtSec, this.crossfadeMs);
  }
}
