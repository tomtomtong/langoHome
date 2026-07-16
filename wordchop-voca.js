/* Load Vocabulary CMS (/api/voca) into Word Chop word list. */
(() => {
  "use strict";

  const ROUND_WORD_COUNT = 10;

  function shuffle(arr) {
    const list = arr.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function lettersOnly(value) {
    return String(value || "").replace(/[^a-zA-Z]/g, "");
  }

  function isWordChopCandidate(item) {
    const word = String(item?.content ?? item?.word ?? "").trim();
    if (!/^[A-Za-z][A-Za-z'-]{1,22}$/.test(word)) return false;
    if (/\s/.test(word)) return false;
    return lettersOnly(word).length >= 3;
  }

  function chunksFromKeywords(word, keywords) {
    const raw = String(keywords || "").trim();
    if (!raw || !/[\/\-\s]/.test(raw)) return null;
    const parts = raw
      .split(/[\/\-\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;
    if (lettersOnly(parts.join("")).toLowerCase() !== lettersOnly(word).toLowerCase()) {
      return null;
    }
    return parts;
  }

  function autoChunks(word) {
    const w = lettersOnly(word);
    if (!w) return [String(word || "word")];
    if (w.length <= 4) return [w];

    const lower = w.toLowerCase();
    const vowels = new Set("aeiouy");
    const breaks = [];
    let i = 1;

    while (i < lower.length - 1) {
      const prev = lower[i - 1];
      const cur = lower[i];
      const next = lower[i + 1];

      // V | CV
      if (vowels.has(prev) && !vowels.has(cur) && vowels.has(next)) {
        breaks.push(i);
        i += 1;
        continue;
      }

      // VC | CV (keep final consonant of cluster with next syllable)
      if (vowels.has(prev) && !vowels.has(cur) && !vowels.has(next)) {
        let k = i + 1;
        while (k < lower.length && !vowels.has(lower[k])) k += 1;
        if (k < lower.length && k - i >= 1) {
          breaks.push(k - 1);
          i = k;
          continue;
        }
      }

      i += 1;
    }

    if (!breaks.length) {
      const mid = Math.ceil(w.length / 2);
      return [w.slice(0, mid), w.slice(mid)].filter(Boolean);
    }

    const chunks = [];
    let start = 0;
    for (const pos of breaks) {
      if (pos > start && pos < w.length) {
        chunks.push(w.slice(start, pos));
        start = pos;
      }
    }
    chunks.push(w.slice(start));
    return chunks.filter(Boolean);
  }

  function levelLabel(level) {
    const n = Number(level);
    if (!Number.isFinite(n)) return "Medium";
    if (n <= 1) return "Easy";
    if (n >= 3) return "Hard";
    return "Medium";
  }

  function toWordChopEntry(item) {
    const word = String(item?.content ?? item?.word ?? "").trim();
    const keywords = String(item?.keywords ?? "").trim();
    const chunks = chunksFromKeywords(word, keywords) || autoChunks(word);
    const meaning = chunksFromKeywords(word, keywords) ? "" : keywords;
    return {
      word,
      chunks,
      meaning,
      pronunciation: "",
      hint: meaning
        ? `Meaning hint: ${meaning}`
        : `Chop between the sound parts of “${word}”.`,
      level: levelLabel(item?.level),
      source: "",
      audioUrl: "",
    };
  }

  function pickRoundWords(items) {
    const candidates = items.filter(isWordChopCandidate).map(toWordChopEntry);
    if (!candidates.length) return [];
    return shuffle(candidates).slice(0, Math.min(ROUND_WORD_COUNT, candidates.length));
  }

  async function prepareWordChopWords() {
    try {
      const res = await fetch("/api/voca");
      if (!res.ok) throw new Error(`voca ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const words = pickRoundWords(items);
      if (words.length) {
        globalThis.__WORD_CHOP_WORDS__ = words;
        return words;
      }
    } catch {
      /* keep built-in Word Chop list */
    }
    return null;
  }

  globalThis.prepareWordChopWords = prepareWordChopWords;
})();
