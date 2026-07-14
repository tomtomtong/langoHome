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
          ? data.items.filter((item) => item?.content || item?.word)
          : [];
        loaded = true;
      } catch {
        items = [];
        loaded = false;
      }
    })();
    return loadPromise;
  }

  function getItems() {
    return items.slice();
  }

  function hasItems() {
    return items.length > 0;
  }

  function pickRandom(count, excludeWord) {
    const exclude = String(excludeWord || "").toLowerCase();
    const pool = exclude
      ? items.filter(
          (item) =>
            String(item.content || item.word || "").toLowerCase() !== exclude
        )
      : items.slice();
    shuffle(pool);
    return pool.slice(0, Math.max(0, count));
  }

  function pickRandomOne(lastWord) {
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    const last = String(lastWord || "").toLowerCase();
    let pick = items[0];
    let guard = 0;
    do {
      pick = items[Math.floor(Math.random() * items.length)];
      const label = String(pick.content || pick.word || "").toLowerCase();
      guard += 1;
    } while (label === last && guard < 20);
    return pick;
  }

  function pickRoundPairs(count = 6) {
    const pool = items.filter((item) => item?.content || item?.word);
    if (!pool.length) return [];
    const shuffled = shuffle(pool.slice());
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => {
      const word = String(item.content || item.word || "").trim();
      const imageUrl = String(item.imageUrl || "").trim();
      const hint = String(item.subCategory || item.category || "").trim();
      return {
        word,
        content: word,
        imageUrl,
        hint,
      };
    });
  }

  async function preloadImages(configItems) {
    const urls = (configItems || items).map((item) => item.imageUrl).filter(Boolean);
    await Promise.all(
      urls.map(
        (url) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = img.onerror = () => resolve();
            img.src = url;
          })
      )
    );
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
