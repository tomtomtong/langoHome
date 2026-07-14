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
    const imageUrl = String(item?.imageUrl ?? "").trim();
    const imageProxyUrl =
      item?.imageProxyUrl || (item?.id && imageUrl ? `/api/voca/${item.id}/image` : "");
    return {
      ...item,
      content,
      word: content,
      imageUrl,
      imageProxyUrl,
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
    const normalized = items.map(normalizeItem).filter((item) => item.word);
    const withImages = normalized.filter((item) => item.imageProxyUrl || item.imageUrl);
    const pool = withImages.length ? withImages : normalized;
    if (!pool.length) return [];
    const shuffled = shuffle(pool.slice());
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
      word: item.word,
      imageUrl: item.imageProxyUrl || item.imageUrl || "",
      imageProxyUrl: item.imageProxyUrl || "",
      textOnly: !(item.imageProxyUrl || item.imageUrl),
    }));
  }

  function hasImageItems() {
    return items.some((item) => {
      const normalized = normalizeItem(item);
      return Boolean(normalized.imageProxyUrl || normalized.imageUrl);
    });
  }

  async function preloadImages(configItems) {
    const urls = (configItems || items)
      .map((item) => {
        const normalized = normalizeItem(item);
        return normalized.imageProxyUrl || normalized.imageUrl;
      })
      .filter(Boolean);
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
    hasImageItems,
    isLoaded: () => loaded,
  };
})();
