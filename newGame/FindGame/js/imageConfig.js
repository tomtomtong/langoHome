/* ===========================================================
   Find the Object — image config & persistence (server DB)
   =========================================================== */

const FindImageConfig = (() => {
  "use strict";

  const API_BASE = "";
  const GAME_ID = "findgame";
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
    find_background: {
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
    find_scene: {
      label: "Default scene (fallback)",
      description: "Used for levels that do not have their own scene image",
      default: "assets/images/scene.svg",
      sizeMode: "img",
      apply: () => {
        /* Per-level scenes are applied in game.js */
      },
    },
    find_returnBtn: {
      label: "Return button",
      description: "Top-left restart button",
      default: "assets/images/return-btn.svg",
      sizeMode: "img",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".return-icon").forEach((img) => {
          img.src = url;
          applyImgScale(img, scale);
        });
      },
    },
    find_panel: {
      label: "Overlay panel",
      description: "Completion dialog background",
      default: "assets/images/panel.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".panel").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
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
      console.warn("Image server unavailable; only configured images will be shown.", err);
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

  function applySlot(slotKey) {
    const meta = SLOTS[slotKey];
    if (!meta || !isCustomized(slotKey)) return;
    const url = getUrl(slotKey);
    const scale = meta.scalable === false ? DEFAULT_SCALE : getScale(slotKey);
    meta.apply(url, scale);
  }

  async function applyAll() {
    await loadFromServer();
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
    return getUrl(slotKey);
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
    return value;
  }

  async function resetImage(slotKey) {
    if (!SLOTS[slotKey]) return false;
    await apiFetch(`/api/images/${slotKey}`, { method: "DELETE" });
    delete customized[slotKey];
    delete scales[slotKey];
    return true;
  }

  async function resetAll() {
    await apiFetch(`/api/images?game=${GAME_ID}`, { method: "DELETE" });
    customized = {};
    scales = {};
  }

  return {
    SLOTS,
    GAME_ID,
    DEFAULT_SCALE,
    getUrl,
    getScale,
    isCustomized,
    loadFromServer,
    applyAll,
    uploadImage,
    setScale,
    resetImage,
    resetAll,
    isServerAvailable: () => serverAvailable,
  };
})();
