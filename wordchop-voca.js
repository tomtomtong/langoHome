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

  /** Prefer a single playable English word from CMS content (may be a phrase). */
  function extractPlayableWord(content) {
    const raw = String(content || "").trim();
    if (!raw) return "";
    if (/^[A-Za-z][A-Za-z'-]{1,22}$/.test(raw)) return raw;

    const tokens = raw
      .split(/[^A-Za-z'-]+/)
      .map((token) => token.trim())
      .filter((token) => /^[A-Za-z][A-Za-z'-]{1,22}$/.test(token) && lettersOnly(token).length >= 3);

    if (!tokens.length) return "";
    tokens.sort((a, b) => lettersOnly(b).length - lettersOnly(a).length || b.length - a.length);
    return tokens[0];
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

      if (vowels.has(prev) && !vowels.has(cur) && vowels.has(next)) {
        breaks.push(i);
        i += 1;
        continue;
      }

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
    const word = extractPlayableWord(item?.content ?? item?.word);
    if (!word) return null;
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
    const seen = new Set();
    const candidates = [];
    for (const item of items) {
      const entry = toWordChopEntry(item);
      if (!entry) continue;
      const key = entry.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(entry);
    }
    if (!candidates.length) return [];
    return shuffle(candidates).slice(0, Math.min(ROUND_WORD_COUNT, candidates.length));
  }

  async function fetchVocaItems() {
    const res = await fetch("/api/voca", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      throw new Error(`Vocabulary API failed (${res.status})`);
    }
    if (!contentType.includes("application/json")) {
      throw new Error("Vocabulary API returned non-JSON (login required?)");
    }
    const data = await res.json();
    if (data.grade) {
      console.info(
        `[Word Chop] Vocabulary filtered for grade ${data.grade}` +
          (data.gradeFallback ? " (no matching words; using full list)" : "")
      );
    }
    return Array.isArray(data.items) ? data.items : [];
  }

  async function prepareWordChopWords() {
    try {
      const items = await fetchVocaItems();
      const words = pickRoundWords(items);
      if (words.length) {
        globalThis.__WORD_CHOP_WORDS__ = words;
        console.info(
          `[Word Chop] Loaded ${words.length} word(s) from Vocabulary library:`,
          words.map((w) => w.word).join(", ")
        );
        return words;
      }
      console.warn(
        `[Word Chop] Vocabulary library has ${items.length} item(s), but none could be used for chopping. Using built-in words.`
      );
    } catch (err) {
      console.warn("[Word Chop] Could not load Vocabulary library. Using built-in words.", err);
    }
    globalThis.__WORD_CHOP_WORDS__ = null;
    return null;
  }

  globalThis.prepareWordChopWords = prepareWordChopWords;
})();
