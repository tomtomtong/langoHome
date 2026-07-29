/** Viseme morph targets 0–21 on Tommyv4.vrm. */
export const BLENDSHAPE_COUNT = 22;

export const BLENDSHAPE_LABELS = [
  "Neutral / silence",
  "æ ʌ (AE, AH)",
  "ɑ (AA)",
  "ɔ (AO)",
  "e ʊ (EH, UH)",
  "ɝ (ER)",
  "ɪ i j (IH, IY, Y)",
  "u w (UW, W)",
  "oʊ (OW)",
  "aʊ (AW)",
  "ɔɪ (OY)",
  "aɪ eɪ (AY, EY)",
  "h (HH)",
  "ɹ (R)",
  "l (L)",
  "s z (S, Z)",
  "tʃ ʃ ʒ (CH, SH, JH, ZH)",
  "ð (DH)",
  "f v (F, V)",
  "d n t θ (D, N, T, TH)",
  "g k ŋ (G, K, NG)",
  "b m p (B, M, P)",
];

export const PHONE_TO_BLEND = {
  AA: 2, AE: 1, AH: 1, AO: 3, AW: 9, AY: 11,
  EH: 4, ER: 5, EY: 11, IH: 6, IY: 6, OW: 8, OY: 10, UH: 4, UW: 7,
  B: 21, CH: 16, D: 19, DH: 17, F: 18, G: 20, HH: 12,
  JH: 16, K: 20, L: 14, M: 21, N: 19, NG: 20, P: 21,
  R: 13, S: 15, SH: 16, T: 19, TH: 19, V: 18, W: 7, Y: 6, Z: 15, ZH: 16,
};

/** Inworld TTS viseme symbols (language-agnostic). */
export const VISEME_TO_BLEND = {
  aei: 1,
  o: 8,
  ee: 6,
  bmp: 21,
  fv: 18,
  l: 14,
  r: 13,
  th: 17,
  qw: 7,
  chjsh: 16,
  cdgknstxyz: 19,
};

export function hasFaceMorphTargets(morphTargetDictionary) {
  return (
    morphTargetDictionary?.["0"] !== undefined &&
    morphTargetDictionary?.["21"] !== undefined
  );
}

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
      phoneme: String(i),
      start: i * holdMs,
      end: (i + 1) * holdMs,
      blendId: i,
    });
  }
  return timeline;
}
