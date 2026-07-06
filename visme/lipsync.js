import { textToPhonemeTimeline } from "./phonetics.js";
import {
  BLENDSHAPE_COUNT,
  FACE_BLENDSHAPE_NAMES,
  defaultBlendshapeWeights,
  morphNameToIndex,
} from "./blendshapes.js";

export function smoothMorphTowardTargets(morphMeshes, targets, morphNames, dtSec, tauMs) {
  const tauSec = tauMs / 1000;
  const k = tauSec <= 0 ? 1 : 1 - Math.exp(-dtSec / tauSec);
  for (const mesh of morphMeshes) {
    for (let i = 0; i < morphNames.length; i++) {
      const mi = mesh.morphTargetDictionary[morphNames[i]];
      if (mi === undefined) continue;
      const cur = mesh.morphTargetInfluences[mi];
      mesh.morphTargetInfluences[mi] = cur + (targets[i] - cur) * k;
    }
  }
}

export function clearBlend(morphMeshes, morphNames = FACE_BLENDSHAPE_NAMES) {
  for (const mesh of morphMeshes) {
    for (const name of morphNames) {
      const mi = mesh.morphTargetDictionary[name];
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
    this.morphNames = FACE_BLENDSHAPE_NAMES;
    this.exaggerate = options.exaggerate ?? 1;
    this.crossfadeMs = options.crossfadeMs ?? 50;
    this.msPerPhone = options.msPerPhone ?? 120;
    this.blendshapeWeights = options.blendshapes?.slice?.() ?? defaultBlendshapeWeights();
    this.active = false;
    this.timeline = [];
    this.targets = new Array(BLENDSHAPE_COUNT).fill(0);
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
    clearBlend(this.morphMeshes, this.morphNames);
  }

  update(elapsedMs) {
    if (!this.active || !this.morphMeshes.length) return;

    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastStepT) / 1000);
    this.lastStepT = now;

    this.targets.fill(0);

    if (this.timeline.length) {
      let activeEntry = null;
      for (const entry of this.timeline) {
        if (elapsedMs >= entry.start && elapsedMs < entry.end) {
          activeEntry = entry;
          break;
        }
      }
      if (activeEntry) {
        const morphName = activeEntry.morphName ?? "mouthClose";
        const index = morphNameToIndex(morphName);
        if (index >= 0) {
          const w = this.blendshapeWeights[index] ?? 1;
          this.targets[index] = this.exaggerate * w;
        }
      }
    }

    smoothMorphTowardTargets(
      this.morphMeshes,
      this.targets,
      this.morphNames,
      dtSec,
      this.crossfadeMs
    );
  }
}
