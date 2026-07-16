/* ===========================================================
   Word-Whack Blitz — image config & persistence (server DB)
   =========================================================== */

const ImageConfig = (() => {
  "use strict";

  const API_BASE = "";
  const GAME_ID = "wordwhack";
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

  function applyTransformScale(el, scale, baseTransform, origin) {
    if (scale === 1) {
      el.style.transform = baseTransform || "";
      el.style.transformOrigin = "";
    } else {
      const base = baseTransform ? `${baseTransform} ` : "";
      el.style.transform = `${base}scale(${scale})`.trim();
      el.style.transformOrigin = origin || "center center";
    }
  }

  const SLOTS = {
    background: {
      label: "Background",
      description: "Full scene sky and grass backdrop",
      default: "assets/images/background.svg",
      sizeMode: "cover",
      apply: (url, scale = DEFAULT_SCALE) => {
        const scene = document.querySelector(".scene");
        if (scene) {
          scene.style.backgroundImage = `url("${url}")`;
          scene.style.backgroundSize = bgSize("cover", scale);
          scene.style.backgroundPosition = "center bottom";
        }
      },
    },
    cloud: {
      label: "Cloud",
      description: "Cloud sprite (used on all 3 clouds)",
      default: "assets/images/cloud.svg",
      sizeMode: "contain",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".cloud").forEach((el) => {
          el.style.backgroundImage = `url("${url}")`;
          el.style.backgroundSize = bgSize("contain", scale);
          el.style.backgroundRepeat = "no-repeat";
          el.style.backgroundPosition = "center";
          el.style.backgroundColor = "transparent";
        });
      },
    },
    hole: {
      label: "Mole hole",
      description: "Hole ellipse and front lip",
      default: "assets/images/hole.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".hole-ellip, .hole-lip").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
          el.style.border = "none";
          el.style.boxShadow = "none";
        });
      },
    },
    mole: {
      label: "Tommy character",
      description: "Tommy character used by Word-Whack Blitz",
      default: "assets/images/tommy/tommy-base.png",
      sizeMode: "img",
      scalable: false,
      apply: (_url, scale = DEFAULT_SCALE) => {
        // Word-Whack now has a fixed character identity. An older persisted
        // `mole` upload may still exist in the image database, but it must not
        // replace Tommy when the game loads.
        const usesTommySet = true;
        document.querySelectorAll(".mole-img-normal").forEach((img) => {
          img.src = img.dataset.defaultSrc || SLOTS.mole.default;
          img.style.display = "block";
          img.style.transform = "";
          img.style.transformOrigin = "";
        });
        document.querySelectorAll(".mole-body").forEach((body) => {
          applyTransformScale(body, scale, "translateX(-50%)", "center bottom");
        });
        document.body.classList.add("image-based-mole");
        document.body.classList.toggle("tommy-mole-set", usesTommySet);
      },
    },
    wordSign: {
      label: "Word sign",
      description: "Small sign each mole holds",
      default: "assets/images/word-sign.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".word-sign").forEach((el) => {
          el.style.backgroundImage = `url("${url}")`;
          el.style.backgroundSize = size;
          el.style.backgroundRepeat = "no-repeat";
          el.style.backgroundColor = "transparent";
          el.style.border = "none";
          el.style.boxShadow = "none";
          applyTransformScale(el, scale, "translateX(-50%)", "center bottom");
        });
      },
    },
    sign: {
      label: "Sentence sign",
      description: "Wooden HUD sign for the sentence",
      default: "assets/images/sign.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".sign").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
          el.style.border = "none";
          el.style.boxShadow = "none";
        });
      },
    },
    returnBtn: {
      label: "Return button",
      description: "Top-left return / back button",
      default: "FindGame/assets/images/return-button.png",
      sizeMode: "img",
      apply: (url, scale = DEFAULT_SCALE) => {
        document.querySelectorAll(".return-icon").forEach((img) => {
          img.src = url;
          applyTransformScale(img, scale, "", "left top");
        });
      },
    },
    stopwatch: {
      label: "Timer",
      description: "Timer widget background",
      default: "FindGame/assets/images/countdown-clock.png",
      sizeMode: "contain",
      apply: (url, scale = DEFAULT_SCALE) => {
        applyBg(".timer-chip", url, bgSize("contain", scale));
      },
    },
    progressFrame: {
      label: "Progress bar",
      description: "Footer progress bar frame",
      default: "assets/images/progress-frame.svg",
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
    panel: {
      label: "Overlay panel",
      description: "Start / game-over dialog panel",
      default: "assets/images/panel.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".panel").forEach((el) => {
          el.style.background = `url("${url}") center / ${size} no-repeat`;
          el.style.border = "none";
          el.style.boxShadow = "none";
        });
      },
    },
    button: {
      label: "Button",
      description: "Start / replay button background",
      default: "assets/images/button.svg",
      sizeMode: "stretch",
      apply: (url, scale = DEFAULT_SCALE) => {
        const size = bgSize("stretch", scale);
        document.querySelectorAll(".btn").forEach((el) => {
          el.style.backgroundImage = `url("${url}")`;
          el.style.backgroundSize = size;
          el.style.backgroundRepeat = "no-repeat";
          el.style.backgroundColor = "transparent";
          el.style.border = "none";
        });
      },
    },
    cursor: {
      label: "Hammer cursor",
      description: "Custom cursor over the play area",
      default: "assets/images/cursor.svg",
      scalable: false,
      apply: (url) => {
        const playArea = document.querySelector(".play-area");
        if (playArea) {
          playArea.style.cursor = `url("${url}") 20 20, pointer`;
        }
      },
    },
  };

  let customized = {};
  let scales = {};
  let serverAvailable = true;

  function applyBg(selector, url, size) {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = size || "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
    });
  }

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
      console.warn("Image server unavailable, using default images.", err);
      customized = {};
      scales = {};
      serverAvailable = false;
    }
    return customized;
  }

  function isCustomized(slotKey) {
    return Boolean(customized[slotKey]);
  }

  function loadStore() {
    const store = {};
    for (const key of Object.keys(customized)) store[key] = true;
    return store;
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
    const scale = meta.scalable === false ? DEFAULT_SCALE : getScale(slotKey);
    meta.apply(url, scale);
  }

  function applyDefaults() {
    document.body.classList.remove("image-based-mole");
    document.body.classList.remove("tommy-mole-set");
    document.querySelectorAll(".mole-body").forEach((body) => {
      body.style.transform = "";
      body.style.transformOrigin = "";
    });
    document.querySelectorAll(".word-sign").forEach((el) => {
      el.style.transform = "";
      el.style.transformOrigin = "";
    });
    for (const key of Object.keys(SLOTS)) {
      SLOTS[key].apply(SLOTS[key].default, DEFAULT_SCALE);
    }
  }

  function applyDynamicSlots() {
    for (const key of ["hole", "mole", "wordSign"]) {
      if (SLOTS[key]) applySlot(key);
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
    return getUrl(slotKey);
  }

  async function setScale(slotKey, scale) {
    if (!SLOTS[slotKey]) return false;
    if (SLOTS[slotKey].scalable === false) {
      throw new Error("This slot does not support scaling.");
    }

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
    SLOTS[slotKey].apply(SLOTS[slotKey].default, DEFAULT_SCALE);
    return true;
  }

  async function resetAll() {
    await apiFetch(`/api/images?game=${GAME_ID}`, { method: "DELETE" });
    customized = {};
    scales = {};
    applyDefaults();
  }

  return {
    SLOTS,
    GAME_ID,
    DEFAULT_SCALE,
    getUrl,
    getScale,
    hasCustomScale,
    isCustomized,
    loadStore,
    loadFromServer,
    applyAll,
    applyDynamicSlots,
    uploadImage,
    setScale,
    resetImage,
    resetAll,
    isServerAvailable: () => serverAvailable,
  };
})();
