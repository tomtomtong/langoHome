import { PHONE_TO_BLEND } from "./blendshapes.js";

const DICT = {
  a: ["EY"],
  the: ["DH", "AH"],
  hello: ["HH", "AH", "L", "OW"],
  world: ["W", "ER", "L", "D"],
  english: ["IH", "NG", "G", "L", "IH", "SH"],
  language: ["L", "AE", "NG", "G", "W", "IH", "JH"],
  visme: ["V", "IH", "Z", "M", "IY"],
  good: ["G", "UH", "D"],
  morning: ["M", "AO", "R", "N", "IH", "NG"],
  hi: ["HH", "AY"],
  my: ["M", "AY"],
  name: ["N", "EY", "M"],
  is: ["IH", "Z"],
  yes: ["Y", "EH", "S"],
  no: ["N", "OW"],
  please: ["P", "L", "IY", "Z"],
  thank: ["TH", "AE", "NG", "K"],
  you: ["Y", "UW"],
  welcome: ["W", "EH", "L", "K", "AH", "M"],
  how: ["HH", "AW"],
  are: ["AA", "R"],
  what: ["W", "AH", "T"],
  this: ["DH", "IH", "S"],
  that: ["DH", "AE", "T"],
  love: ["L", "AH", "V"],
  like: ["L", "AY", "K"],
  can: ["K", "AE", "N"],
  do: ["D", "UW"],
  go: ["G", "OW"],
  come: ["K", "AH", "M"],
  see: ["S", "IY"],
  say: ["S", "EY"],
  make: ["M", "EY", "K"],
  take: ["T", "EY", "K"],
  know: ["N", "OW"],
  think: ["TH", "IH", "NG", "K"],
  time: ["T", "AY", "M"],
  people: ["P", "IY", "P", "AH", "L"],
  day: ["D", "EY"],
  man: ["M", "AE", "N"],
  woman: ["W", "UH", "M", "AH", "N"],
  child: ["CH", "AY", "L", "D"],
  friend: ["F", "R", "EH", "N", "D"],
  life: ["L", "AY", "F"],
  hand: ["HH", "AE", "N", "D"],
  work: ["W", "ER", "K"],
  play: ["P", "L", "EY"],
  run: ["R", "AH", "N"],
  walk: ["W", "AO", "K"],
  talk: ["T", "AO", "K"],
  eat: ["IY", "T"],
  drink: ["D", "R", "IH", "NG", "K"],
  sleep: ["S", "L", "IY", "P"],
  open: ["OW", "P", "AH", "N"],
  close: ["K", "L", "OW", "Z"],
  big: ["B", "IH", "G"],
  small: ["S", "M", "AO", "L"],
  new: ["N", "UW"],
  old: ["OW", "L", "D"],
  happy: ["HH", "AE", "P", "IY"],
  sad: ["S", "AE", "D"],
  hot: ["HH", "AA", "T"],
  cold: ["K", "OW", "L", "D"],
  water: ["W", "AO", "T", "ER"],
  fire: ["F", "AY", "ER"],
  earth: ["ER", "TH"],
  sky: ["S", "K", "AY"],
  sun: ["S", "AH", "N"],
  moon: ["M", "UW", "N"],
  star: ["S", "T", "AA", "R"],
  house: ["HH", "AW", "S"],
  home: ["HH", "OW", "M"],
  cat: ["K", "AE", "T"],
  dog: ["D", "AO", "G"],
  fish: ["F", "IH", "SH"],
  bird: ["B", "ER", "D"],
  tree: ["T", "R", "IY"],
  flower: ["F", "L", "AW", "ER"],
  red: ["R", "EH", "D"],
  blue: ["B", "L", "UW"],
  green: ["G", "R", "IY", "N"],
  white: ["W", "AY", "T"],
  black: ["B", "L", "AE", "K"],
  yellow: ["Y", "EH", "L", "OW"],
  one: ["W", "AH", "N"],
  two: ["T", "UW"],
  three: ["TH", "R", "IY"],
  four: ["F", "AO", "R"],
  five: ["F", "AY", "V"],
  six: ["S", "IH", "K", "S"],
  seven: ["S", "EH", "V", "AH", "N"],
  eight: ["EY", "T"],
  nine: ["N", "AY", "N"],
  ten: ["T", "EH", "N"],
  tommy: ["T", "AA", "M", "IY"],
  test: ["T", "EH", "S", "T"],
  innovation: ["IH", "N", "AH", "V", "EY", "SH", "AH", "N"],
  computer: ["K", "AH", "M", "P", "Y", "UW", "T", "ER"],
  beautiful: ["B", "Y", "UW", "T", "AH", "F", "AH", "L"],
};

const CLUSTERS = [
  { l: "tch", p: ["CH"] },
  { l: "igh", p: ["AY"] },
  { l: "tion", p: ["SH", "AH", "N"] },
  { l: "sion", p: ["ZH", "AH", "N"] },
  { l: "ph", p: ["F"] },
  { l: "sh", p: ["SH"] },
  { l: "ch", p: ["CH"] },
  { l: "th", p: ["TH"] },
  { l: "ng", p: ["NG"] },
  { l: "wh", p: ["W"] },
  { l: "qu", p: ["K", "W"] },
  { l: "ck", p: ["K"] },
  { l: "ee", p: ["IY"] },
  { l: "oo", p: ["UW"] },
  { l: "oa", p: ["OW"] },
  { l: "ai", p: ["EY"] },
  { l: "ay", p: ["EY"] },
  { l: "ea", p: ["IY"] },
  { l: "ie", p: ["IY"] },
  { l: "ou", p: ["AW"] },
  { l: "ow", p: ["AW"] },
  { l: "oi", p: ["OY"] },
  { l: "oy", p: ["OY"] },
  { l: "ar", p: ["AA", "R"] },
  { l: "or", p: ["AO", "R"] },
  { l: "er", p: ["ER"] },
  { l: "ir", p: ["ER"] },
  { l: "ur", p: ["ER"] },
  { l: "kn", p: ["N"], s: true },
  { l: "wr", p: ["R"], s: true },
  { l: "ed", p: ["D"], e: true },
  { l: "ing", p: ["IH", "NG"], e: true },
];

function letter(c, next, last) {
  const map = {
    a: ["AE"], b: ["B"], d: ["D"], e: last ? [] : ["EH"], f: ["F"],
    h: ["HH"], i: ["IH"], j: ["JH"], k: ["K"], l: ["L"], m: ["M"],
    n: ["N"], o: ["OW"], p: ["P"], q: ["K"], r: ["R"], s: ["S"],
    t: ["T"], u: ["AH"], v: ["V"], w: ["W"], x: ["K", "S"], z: ["Z"],
  };
  if (c === "c") return "eiy".includes(next) ? ["S"] : ["K"];
  if (c === "g") return "eiy".includes(next) ? ["JH"] : ["G"];
  if (c === "y") return last ? ["IY"] : ["Y"];
  return map[c] || [];
}

const MULTILINGUAL_VISEMES = [1, 6, 8, 11, 14, 15, 19, 21];

function isLatinWord(raw) {
  return /^[\p{Script=Latin}\p{M}''-]+$/u.test(raw);
}

export function isMostlyLatinText(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  let latin = 0;
  for (const ch of letters) {
    if (/[\p{Script=Latin}]/u.test(ch)) latin += 1;
  }
  return latin / letters.length >= 0.75;
}

function splitSpeechUnits(text) {
  const units = [];
  const re = /(\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Devanagari}|\p{Script=Thai}|\p{L}+|\d+)/gu;
  let match;
  while ((match = re.exec(text)) !== null) {
    const token = match[0].trim();
    if (token) units.push(token);
  }
  return units;
}

function multilingualUnitTimeline(units, msPerPhone) {
  const timeline = [];
  let t = 0;
  const hold = Math.max(60, msPerPhone);
  const gap = Math.max(30, Math.round(hold * 0.35));

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const phones = isLatinWord(unit) ? wordToPhonemes(unit) : [];
    if (phones.length) {
      for (const p of phones) {
        timeline.push({ phoneme: p, start: t, end: t + hold, blendId: PHONE_TO_BLEND[p] ?? 0 });
        t += hold;
      }
    } else {
      const graphemes = [...unit];
      for (let gi = 0; gi < graphemes.length; gi += 1) {
        const blendId = MULTILINGUAL_VISEMES[(i + gi) % MULTILINGUAL_VISEMES.length];
        timeline.push({
          phoneme: graphemes[gi],
          start: t,
          end: t + hold,
          blendId,
        });
        t += hold;
      }
    }
    if (i < units.length - 1) {
      timeline.push({ phoneme: "SIL", start: t, end: t + gap, blendId: 0 });
      t += gap;
    }
  }

  timeline.push({ phoneme: "SIL", start: t, end: t + gap, blendId: 0 });
  return timeline;
}

function wordToPhonemes(raw) {
  const w = raw.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return [];
  if (DICT[w]) return [...DICT[w]];

  const out = [];
  let i = 0;
  while (i < w.length) {
    let hit = null;
    for (const r of CLUSTERS) {
      if (w.slice(i, i + r.l.length) !== r.l) continue;
      if (r.s && i !== 0) continue;
      if (r.e && i + r.l.length !== w.length) continue;
      hit = r;
      break;
    }
    if (hit) { out.push(...hit.p); i += hit.l.length; continue; }
    out.push(...letter(w[i], w[i + 1] || "", i === w.length - 1));
    i++;
  }
  return out;
}

export function textToPhonemeTimeline(text, msPerPhone = 120) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (!isMostlyLatinText(trimmed)) {
    return multilingualUnitTimeline(splitSpeechUnits(trimmed), msPerPhone);
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const timeline = [];
  let t = 0;
  const wordGap = Math.round((msPerPhone * 80) / 120);
  const finalSilence = Math.round((msPerPhone * 100) / 120);

  for (let wi = 0; wi < words.length; wi++) {
    const phones = isLatinWord(words[wi]) ? wordToPhonemes(words[wi]) : [];
    if (phones.length) {
      for (const p of phones) {
        timeline.push({ phoneme: p, start: t, end: t + msPerPhone, blendId: PHONE_TO_BLEND[p] ?? 0 });
        t += msPerPhone;
      }
    } else {
      const graphemes = [...words[wi]];
      for (let gi = 0; gi < graphemes.length; gi += 1) {
        const blendId = MULTILINGUAL_VISEMES[gi % MULTILINGUAL_VISEMES.length];
        timeline.push({ phoneme: graphemes[gi], start: t, end: t + msPerPhone, blendId });
        t += msPerPhone;
      }
    }
    if (wi < words.length - 1) {
      timeline.push({ phoneme: "SIL", start: t, end: t + wordGap, blendId: 0 });
      t += wordGap;
    }
  }
  timeline.push({ phoneme: "SIL", start: t, end: t + finalSilence, blendId: 0 });
  return timeline;
}

export function timelineToIpaString(timeline) {
  return timeline
    .filter((e) => e.phoneme !== "SIL")
    .map((e) => IPA[e.phoneme] || e.phoneme.toLowerCase())
    .join(" ");
}

const IPA = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ",
  EH: "e", ER: "ɝ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ",
  OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "g", HH: "h",
  JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p",
  R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w",
  Y: "j", Z: "z", ZH: "ʒ",
};
