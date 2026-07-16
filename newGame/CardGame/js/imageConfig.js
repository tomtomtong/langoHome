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

  const SLOTS = {
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
