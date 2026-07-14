/* Shared vocabulary list from CMS (/api/voca) */
const VocaConfig = (() => {
  let items = [];
  let loaded = false;
  let loadPromise = null;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function loadFromServer() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const res = await fetch("/api/voca");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        items = Array.isArray(data.items)
          ? data.items.map(normalizeItem).filter((item) => item.word)
          : [];
        loaded = true;
      } catch {
        items = [];
        loaded = false;
      }
    })();
    return loadPromise;
  }

  function normalizeItem(item) {
    const content = String(item?.content ?? item?.word ?? "").trim();
    return {
      ...item,
      content,
      word: content,
    };
  }

  function getItems() {
    return items.map(normalizeItem);
  }

  function hasItems() {
    return items.length > 0;
  }

  function pickRandom(count, excludeWord) {
    const pool = excludeWord
      ? items.filter((item) => item.word !== excludeWord)
      : items.slice();
    shuffle(pool);
    return pool.slice(0, Math.max(0, count)).map(normalizeItem);
  }

  function pickRandomOne(lastWord) {
    if (!items.length) return null;
    if (items.length === 1) return normalizeItem(items[0]);
    let pick = items[0];
    let guard = 0;
    do {
      pick = items[Math.floor(Math.random() * items.length)];
      guard += 1;
    } while (pick.word === lastWord && guard < 20);
    return normalizeItem(pick);
  }

  function pickRoundPairs(count = 6) {
    const pool = items
      .map(normalizeItem)
      .filter((item) => item.word);
    if (!pool.length) return [];
    const shuffled = shuffle(pool.slice());
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
      word: item.word,
      textOnly: true,
    }));
  }

  async function preloadImages() {
    return Promise.resolve();
  }

  return {
    loadFromServer,
    getItems,
    hasItems,
    pickRandom,
    pickRandomOne,
    pickRoundPairs,
    preloadImages,
    isLoaded: () => loaded,
  };
})();
