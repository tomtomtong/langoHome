/* ===========================================================
   Card Game — image config & persistence (server DB)
   Separate slot keys (card_*) from Word-Whack Blitz
   =========================================================== */

const CardImageConfig = (() => {
  "use strict";

  const API_BASE = "";
  const GAME_ID = "cardgame";
  const DEFAULT_SCALE = 1;

  function bgSize(mode, scale) {
    if (scale === 1) {
      if (mode === "cover") return "cover";
      if (mode === "contain") return "contain";
      return "100% 100%";
    }
    const pct = `${Math.round(100 * scale)}%`;
    if (mode === "cover" || mode === "contain") return `${pct} auto`;
    return `${pct} ${pct}`;
  }

  function applyImgScale(el, scale) {
    if (scale === 1) {
      el.style.transform = "";
      el.style.transformOrigin = "";
    } else {
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = "center center";
    }
  }

  const SLOTS = {
    card_background: {
      label: "Background",
      description: "Full-screen backdrop behind the game",
      default: "assets/images/background.svg",
      sizeMode: "cover",
      apply: (url, scale = DEFAULT_SCALE) => {
        const bg = document.getElementById("bga-custom-background");
        if (bg) {
          bg.style.backgroundImage = `url("${url}")`;
          bg.style.backgroundSize = bgSize("cover", scale);
          bg.style.backgroundPosition = "center";
        }
      },
    },
    card_returnBtn: {
      label: "Return button",
      description: "Top-left return / restart button",
      default: "assets/images/return-btn.svg",
      sizeMode: "img",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".return-icon").forEach((img) => {
          img.src = url;
          applyImgScale(img, scale);
        });
      },
    },
    card_timer: {
      label: "Timer icon",
      description: "Stopwatch icon next to the countdown",
      default: "assets/images/timer.svg",
      sizeMode: "img",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".timer-icon").forEach((img) => {
          img.src = url;
          applyImgScale(img, scale);
        });
      },
    },
    card_star: {
      label: "Star",
      description: "Progress bar milestone stars",
      default: "assets/images/star.svg",
      sizeMode: "img",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".star-img").forEach((img) => {
          img.src = url;
          applyImgScale(img, scale);
        });
      },
    },
    card_cardBack: {
      label: "Card back",
      description: "Face-down card design",
      default: "assets/images/card-back.svg",
      sizeMode: "cover",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("cover", scale);
        document.querySelectorAll(".card.card-back").forEach((el) => {
          el.style.backgroundImage = `url("${url}")`;
          el.style.backgroundSize = size;
          el.style.backgroundPosition = "center";
          el.style.backgroundColor = "transparent";
          el.textContent = "";
        });
      },
    },
    card_progressBar: {
      label: "Progress bar",
      description: "Footer progress bar frame",
      default: "assets/images/progress-bar.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".progress-frame").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
          el.style.border = "none";
          el.style.boxShadow = "none";
        });
      },
    },
    card_levelPanel: {
      label: "Level complete panel",
      description: "Game-over / time-up dialog panel",
      default: "assets/images/level-panel.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".level-complete-inner").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
          el.style.border = "none";
          el.style.boxShadow = "none";
        });
      },
    },
  };

  let customized = {};
  let scales = {};
  let serverAvailable = true;

  async function apiFetch(url, options) {
    const res = await fetch(`${API_BASE}${url}`, options);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw new Error(body?.error || `Request failed (${res.status})`);
    }
    return body;
  }

  async function loadFromServer() {
    try {
      const data = await apiFetch(`/api/images?game=${GAME_ID}`);
      customized = data.slots || {};
      scales = data.scales || {};
      serverAvailable = true;
    } catch (err) {
      console.warn("Card image server unavailable, using default images.", err);
      customized = {};
      scales = {};
      serverAvailable = false;
    }
    return customized;
  }

  function isCustomized(slotKey) {
    return Boolean(customized[slotKey]);
  }

  function getUrl(slotKey) {
    const entry = customized[slotKey];
    if (entry) {
      return entry.url || `${API_BASE}/api/images/${slotKey}?v=${entry.updatedAt}`;
    }
    return SLOTS[slotKey]?.default || "";
  }

  function getScale(slotKey) {
    return scales[slotKey] ?? DEFAULT_SCALE;
  }

  function hasCustomScale(slotKey) {
    return scales[slotKey] != null && scales[slotKey] !== DEFAULT_SCALE;
  }

  function applySlot(slotKey) {
    const meta = SLOTS[slotKey];
    if (!meta) return;
    const url = isCustomized(slotKey) ? getUrl(slotKey) : meta.default;
    meta.apply(url, getScale(slotKey));
  }

  function applyDefaults() {
    for (const key of Object.keys(SLOTS)) {
      SLOTS[key].apply(SLOTS[key].default, DEFAULT_SCALE);
    }
  }

  async function applyAll() {
    await loadFromServer();
    applyDefaults();
    for (const key of Object.keys(SLOTS)) {
      applySlot(key);
    }
  }

  async function uploadImage(slotKey, file) {
    if (!file || !file.type.startsWith("image/")) {
      throw new Error("Please choose an image file (PNG, JPG, SVG, WebP, GIF).");
    }

    const form = new FormData();
    form.append("image", file);

    const data = await apiFetch(`/api/images/${slotKey}`, {
      method: "PUT",
      body: form,
    });

    customized[slotKey] = {
      mimeType: data.mimeType,
      updatedAt: data.updatedAt,
      url: data.url,
    };

    applySlot(slotKey);
    const url = getUrl(slotKey);
    if (typeof window.onCardImageUpdated === "function") {
      window.onCardImageUpdated(slotKey, url);
    }
    return url;
  }

  async function setScale(slotKey, scale) {
    if (!SLOTS[slotKey]) return false;

    const value = Math.round(Number(scale) * 100) / 100;
    if (!Number.isFinite(value) || value < 0.25 || value > 3) {
      throw new Error("Scale must be between 0.25 and 3.");
    }

    if (value === DEFAULT_SCALE) {
      await apiFetch(`/api/images/${slotKey}/scale`, { method: "DELETE" });
      delete scales[slotKey];
    } else {
      await apiFetch(`/api/images/${slotKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scale: value }),
      });
      scales[slotKey] = value;
    }

    applySlot(slotKey);
    notifyCardImageUpdated(slotKey);
    return value;
  }

  function notifyCardImageUpdated(slotKey) {
    if (typeof window.onCardImageUpdated !== "function") return;
    window.onCardImageUpdated(slotKey, getUrl(slotKey));
  }

  async function resetImage(slotKey) {
    if (!SLOTS[slotKey]) return false;
    await apiFetch(`/api/images/${slotKey}`, { method: "DELETE" });
    delete customized[slotKey];
    delete scales[slotKey];
    SLOTS[slotKey].apply(SLOTS[slotKey].default, DEFAULT_SCALE);
    if (typeof window.onCardImageUpdated === "function") {
      window.onCardImageUpdated(slotKey, SLOTS[slotKey].default);
    }
    return true;
  }

  async function resetAll() {
    await apiFetch(`/api/images?game=${GAME_ID}`, { method: "DELETE" });
    customized = {};
    scales = {};
    applyDefaults();
    if (typeof window.onCardImageUpdated === "function") {
      window.onCardImageUpdated("*", null);
    }
  }

  return {
    SLOTS,
    GAME_ID,
    DEFAULT_SCALE,
    getUrl,
    getScale,
    hasCustomScale,
    isCustomized,
    loadFromServer,
    applyAll,
    applySlot,
    uploadImage,
    setScale,
    resetImage,
    resetAll,
    isServerAvailable: () => serverAvailable,
  };
})();
