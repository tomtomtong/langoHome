/** Face mesh morph targets from TommyOrignial.vrm (ARKit-style). */
export const FACE_BLENDSHAPE_NAMES = [
  "AAA",
  "eyeBlink",
  "eyeBlink.L",
  "eyeBlink.R",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawRight",
  "jawOpen",
  "mouthClose",
  "mouthFunnel",
  "mouthPucker",
  "mouthRight",
  "mouthLeft",
  "mouthSmile",
  "mouthSmile.L",
  "mouthSmile.R",
  "mouthFrownRight",
  "mouthFrownLeft",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "noseSneerLeft",
  "noseSneerRight",
];

export const BLENDSHAPE_COUNT = FACE_BLENDSHAPE_NAMES.length;

export const BLENDSHAPE_LABELS = FACE_BLENDSHAPE_NAMES;

const MORPH_INDEX = Object.fromEntries(
  FACE_BLENDSHAPE_NAMES.map((name, index) => [name, index])
);

export function morphNameToIndex(name) {
  const idx = MORPH_INDEX[name];
  return idx === undefined ? -1 : idx;
}

export function hasFaceMorphTargets(morphTargetDictionary) {
  return (
    morphTargetDictionary?.jawOpen !== undefined &&
    morphTargetDictionary?.mouthClose !== undefined
  );
}

/** Maps ARKit phoneme codes to face morph target names. */
export const PHONE_TO_MORPH = {
  AA: "jawOpen",
  AE: "mouthStretchLeft",
  AH: "mouthStretchRight",
  AO: "mouthFunnel",
  AW: "jawOpen",
  AY: "mouthSmile",
  EH: "mouthLowerDownLeft",
  ER: "mouthRollLower",
  EY: "mouthSmile",
  IH: "mouthSmile",
  IY: "mouthSmile",
  OW: "mouthFunnel",
  OY: "mouthPucker",
  UH: "mouthLowerDownRight",
  UW: "mouthPucker",
  B: "mouthClose",
  CH: "mouthShrugUpper",
  D: "mouthPressLeft",
  DH: "mouthUpperUpLeft",
  F: "mouthFrownLeft",
  G: "jawOpen",
  HH: "jawOpen",
  JH: "mouthShrugUpper",
  K: "jawOpen",
  L: "mouthShrugLower",
  M: "mouthClose",
  N: "mouthPressLeft",
  NG: "jawOpen",
  P: "mouthClose",
  R: "mouthRollLower",
  S: "mouthSmile",
  SH: "mouthShrugUpper",
  T: "mouthPressLeft",
  TH: "mouthPressLeft",
  V: "mouthFrownLeft",
  W: "mouthPucker",
  Y: "mouthSmile",
  Z: "mouthSmile",
  ZH: "mouthShrugUpper",
};

export function defaultBlendshapeWeights() {
  return Array(BLENDSHAPE_COUNT).fill(1);
}

export function normalizeBlendshapes(raw) {
  const weights = defaultBlendshapeWeights();
  if (!Array.isArray(raw)) return weights;
  for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
    const n = Number(raw[i]);
    weights[i] = Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
  }
  return weights;
}

export function buildBlendshapeTestTimeline(holdMs = 700) {
  const timeline = [];
  for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
    timeline.push({
      phoneme: FACE_BLENDSHAPE_NAMES[i],
      start: i * holdMs,
      end: (i + 1) * holdMs,
      morphName: FACE_BLENDSHAPE_NAMES[i],
      blendId: i,
    });
  }
  return timeline;
}
