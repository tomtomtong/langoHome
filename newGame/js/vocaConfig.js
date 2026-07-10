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
          ? data.items.filter((item) => item?.word && item?.imageUrl)
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
    const pool = excludeWord
      ? items.filter((item) => item.word !== excludeWord)
      : items.slice();
    shuffle(pool);
    return pool.slice(0, Math.max(0, count));
  }

  function pickRandomOne(lastWord) {
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    let pick = items[0];
    let guard = 0;
    do {
      pick = items[Math.floor(Math.random() * items.length)];
      guard += 1;
    } while (pick.word === lastWord && guard < 20);
    return pick;
  }

  function pickRoundPairs(count = 6) {
    if (!items.length) return [];
    const shuffled = shuffle(items.slice());
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
      word: item.word,
      imageUrl: item.imageUrl,
    }));
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
