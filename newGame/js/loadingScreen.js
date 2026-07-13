/* ===========================================================
   Shared game loading screen
   =========================================================== */

const GameLoadingScreen = (() => {
  "use strict";

  const MIN_MS = 550;
  const FADE_MS = 420;
  const shownAt = Date.now();
  const overlayEl = document.getElementById("game-loading");

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  async function preloadImages(urls) {
    const unique = [...new Set((urls || []).filter(Boolean))];
    await Promise.all(unique.map(preloadImage));
  }

  async function preloadImageConfig(config) {
    if (!config?.SLOTS) return;
    const urls = Object.keys(config.SLOTS).map((key) => {
      if (typeof config.getUrl === "function") return config.getUrl(key);
      return config.SLOTS[key]?.default || "";
    });
    await preloadImages(urls);
  }

  async function hide() {
    if (!overlayEl) {
      document.documentElement.classList.add("game-ready");
      window.dispatchEvent(new CustomEvent("lango:page-reveal"));
      return;
    }

    const elapsed = Date.now() - shownAt;
    if (elapsed < MIN_MS) await wait(MIN_MS - elapsed);

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
    }

    overlayEl.classList.add("is-hidden");
    overlayEl.setAttribute("aria-busy", "false");
    document.documentElement.classList.add("game-ready");
    window.dispatchEvent(new CustomEvent("lango:page-reveal"));
    await wait(FADE_MS);
    overlayEl.remove();
  }

  return {
    hide,
    preloadImage,
    preloadImages,
    preloadImageConfig,
  };
})();
