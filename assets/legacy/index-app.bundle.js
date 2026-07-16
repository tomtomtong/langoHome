(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // visme/avatar-legacy.js
  var DEFAULT_AVATAR = {
    cameraX: 0,
    cameraY: 1.3,
    cameraZ: 1.6,
    targetX: 0,
    targetY: 1.42,
    targetZ: 0
  };
  function normalizeAvatar(raw) {
    const a = raw && typeof raw === "object" ? raw : {};
    const num = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      cameraX: num(a.cameraX, DEFAULT_AVATAR.cameraX),
      cameraY: num(a.cameraY, DEFAULT_AVATAR.cameraY),
      cameraZ: num(a.cameraZ, DEFAULT_AVATAR.cameraZ),
      targetX: num(a.targetX, DEFAULT_AVATAR.targetX),
      targetY: num(a.targetY, DEFAULT_AVATAR.targetY),
      targetZ: num(a.targetZ, DEFAULT_AVATAR.targetZ)
    };
  }
  var DEFAULT_LIPSYNC = {
    exaggerate: 1,
    msPerPhone: 120,
    crossfadeMs: 50,
    blendshapes: {}
  };
  var DEFAULT_LIGHTING = {
    hemisphereIntensity: 1.6,
    keyLightIntensity: 1.25,
    fillLightIntensity: 0.5,
    exposure: 1.35
  };
  function normalizeLighting(raw) {
    const l = raw && typeof raw === "object" ? raw : {};
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    };
    return {
      hemisphereIntensity: num(l.hemisphereIntensity, 0, 4, DEFAULT_LIGHTING.hemisphereIntensity),
      keyLightIntensity: num(l.keyLightIntensity, 0, 4, DEFAULT_LIGHTING.keyLightIntensity),
      fillLightIntensity: num(l.fillLightIntensity, 0, 4, DEFAULT_LIGHTING.fillLightIntensity),
      exposure: num(l.exposure, 0.4, 3, DEFAULT_LIGHTING.exposure)
    };
  }
  function normalizeLipsync(raw) {
    const l = raw && typeof raw === "object" ? raw : {};
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    };
    return {
      exaggerate: num(l.exaggerate, 0.2, 3, DEFAULT_LIPSYNC.exaggerate),
      msPerPhone: num(l.msPerPhone, 40, 400, DEFAULT_LIPSYNC.msPerPhone),
      crossfadeMs: num(l.crossfadeMs, 0, 200, DEFAULT_LIPSYNC.crossfadeMs),
      blendshapes: l.blendshapes && typeof l.blendshapes === "object" ? l.blendshapes : {}
    };
  }
  var TommyAvatar = class {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.options = options || {};
      this.loaded = false;
      this._backgroundUrl = null;
    }
    async load() {
      this.loaded = true;
      if (this.canvas) this.canvas.style.display = "none";
      return this;
    }
    async setBackgroundUrl(url) {
      this._backgroundUrl = url || null;
    }
    setLighting() {
    }
    setLipsync() {
    }
    setBlendshapes() {
    }
    playAnimation() {
      return Promise.resolve();
    }
    stopAnimation() {
    }
    setCamera() {
    }
    getCamera() {
      return normalizeAvatar(this.options.avatar);
    }
    saveCamera() {
      return normalizeAvatar(this.options.avatar);
    }
    dispose() {
      this.loaded = false;
    }
  };

  // <stdin>
  var KEY = "inworld_api_key";
  var PROMPT_KEY = "inworld_system_prompt";
  var VOICE_KEY = "inworld_voice_id";
  var MODEL_KEY = "inworld_model";
  var AVATAR_KEY = "inworld_avatar";
  var LIPSYNC_KEY = "inworld_lipsync";
  var DEFAULT_PROMPT = "You are Uncle Tommy, a friendly voice assistant. Keep responses brief.";
  var DEFAULT_VOICE = "default-zylgts2tamenvybeti3z0w__uncle_tommy";
  var DEFAULT_MODEL = "openai/gpt-4o-mini";
  var PREVIEW_MODE = new URLSearchParams(location.search).get("preview") === "1";
  var sfx = window.LangoSfx;
  var btnStart = document.getElementById("btn-start");
  var btnStop = document.getElementById("btn-stop");
  var statusEl = document.getElementById("status");
  var statusIdleEl = document.getElementById("status-idle");
  var errEl = document.getElementById("err");
  var errIdleEl = document.getElementById("err-idle");
  var avatarStatusEl = document.getElementById("avatar-status");
  var btnSaveCamera = document.getElementById("btn-save-camera");
  var btnCancelCamera = document.getElementById("btn-cancel-camera");
  var btnCameraUp = document.getElementById("btn-camera-up");
  var btnCameraDown = document.getElementById("btn-camera-down");
  var cameraSaveStatusEl = document.getElementById("camera-save-status");
  var btnSendLog = document.getElementById("btn-send-log");
  var debugUploadStatusEl = document.getElementById("debug-upload-status");
  var idleVideoScreen = document.getElementById("idle-video-screen");
  var idleVideoEl = document.getElementById("idle-video");
  var transitionVideoEl = document.getElementById("transition-video");
  var idleVideoLoadingEl = document.getElementById("idle-video-loading");
  var idleVideoHint = document.getElementById("idle-video-hint");
  var hkoWeatherBar = document.getElementById("hko-weather-bar");
  var hkoWeatherIcon = document.getElementById("hko-weather-icon");
  var hkoWeatherCondition = document.getElementById("hko-weather-condition");
  var hkoWeatherTemp = document.getElementById("hko-weather-temp");
  var hkoWeatherHumidity = document.getElementById("hko-weather-humidity");
  var hkoWeatherLocation = document.getElementById("hko-weather-location");
  var hkoWeatherDatetime = document.getElementById("hko-weather-datetime");
  var avatarStageEl = document.getElementById("avatar-stage");
  var gameLaunchOverlay = document.getElementById("game-launch-overlay");
  var gameLaunchCard = document.getElementById("game-launch-card");
  var gameLaunchHeading = document.getElementById("game-launch-heading");
  var gameLaunchReel = document.getElementById("game-launch-reel");
  var gameLaunchIcon = document.getElementById("game-launch-icon");
  var gameLaunchName = document.getElementById("game-launch-name");
  var gameLaunchSub = document.getElementById("game-launch-sub");
  var gameLaunchProgress = document.getElementById("game-launch-progress");
  var gameLaunchConfetti = document.getElementById("game-launch-confetti");
  var dailyRewardsBtn = document.getElementById("daily-rewards-btn");
  var dailyRewardsOverlay = document.getElementById("daily-rewards-overlay");
  var dailyRewardsClose = document.getElementById("daily-rewards-close");
  var dailyRewardsSlots = document.getElementById("daily-rewards-slots");
  var dailyRewardsClaimBtn = document.getElementById("daily-rewards-claim-btn");
  var dailyRewardsStreakText = document.getElementById("daily-rewards-streak-text");
  var dailyRewardsStarsText = document.getElementById("daily-rewards-stars-text");
  var dailyRewardsStreakBadge = document.getElementById("daily-rewards-streak-badge");
  var dailyRewardsCelebrate = document.getElementById("daily-rewards-celebrate");
  var dailyRewardCongrats = document.getElementById("daily-reward-congrats");
  var dailyRewardCongratsTitle = document.getElementById("daily-reward-congrats-title");
  var dailyRewardCongratsIcon = document.getElementById("daily-reward-congrats-icon");
  var dailyRewardCongratsName = document.getElementById("daily-reward-congrats-name");
  var dailyRewardModalCta = document.getElementById("daily-reward-modal-cta");
  var dailyRewardModalCtaLabel = document.getElementById("daily-reward-modal-cta-label");
  var previewScreenSelect = document.getElementById("preview-screen-select");
  var gamePreviewFrame = document.getElementById("game-preview-frame");
  var previewExit = document.getElementById("preview-exit");
  var previewToolbarHide = document.getElementById("preview-toolbar-hide");
  var previewToolbarShow = document.getElementById("preview-toolbar-show");
  var PREVIEW_TOOLBAR_COLLAPSED_KEY = "preview-toolbar-collapsed";
  var dailyRewardsStatus = null;
  var dailyRewardsStudent = false;
  var previewClaimedMilestones = [];
  var REWARD_SLOT_CARD_ASSETS = {
    1: "1day.png",
    3: "3days.png",
    5: "5days.png",
    7: "7days.png"
  };
  var REWARD_SLOT_DEFAULTS = [
    { day: 1, id: "word-whack", label: "New Game", icon: "mole", stars: 5 },
    { day: 3, id: "langomon-doll", label: "Langomon Doll", icon: "penguin", stars: 10 },
    { day: 5, id: "new-spot", label: "New Spot", icon: "spot", stars: 15 },
    { day: 7, id: "seven-day-doll", label: "Langomon Doll", icon: "penguin", stars: 0 }
  ];
  function dailyRewardAsset(name) {
    return "/assets/daily-rewards/".concat(name, "?v=20260713f");
  }
  function syncDailyRewardActionPosition() {
    const rewardsActions = document.querySelector(".daily-rewards-actions");
    const activeCard = dailyRewardsSlots.querySelector(".daily-reward-slot.active");
    if (!rewardsActions || !activeCard || !(dailyRewardsStatus == null ? void 0 : dailyRewardsStatus.canClaimMilestone)) {
      if (rewardsActions) rewardsActions.hidden = true;
      return;
    }
    if (rewardsActions.parentElement !== activeCard) activeCard.appendChild(rewardsActions);
    rewardsActions.hidden = false;
  }
  function syncDailyRewardScrollbar() {
    const thumb = document.getElementById("daily-rewards-scrollbar-thumb");
    if (!thumb) return;
    const { scrollWidth, clientWidth, scrollLeft } = dailyRewardsSlots;
    if (!scrollWidth) return;
    const widthPct = Math.min(100, clientWidth / scrollWidth * 100);
    thumb.style.width = "".concat(widthPct, "%");
    thumb.style.left = "".concat(Math.min(100 - widthPct, scrollLeft / scrollWidth * 100), "%");
  }
  function previewRewardStatus() {
    const milestones = [
      { day: 1, id: "word-whack", label: "New Game", title: "New Game In Garden", name: "Word-Whack Blitz", icon: "mole", cta: "Get", destination: "modal", stars: 5 },
      { day: 3, id: "langomon-doll", label: "Langomon Doll", title: "New Langomon Doll", name: "Penguin Doll", icon: "penguin", cta: "Add to collection", destination: "modal", stars: 10 },
      { day: 5, id: "new-spot", label: "New Spot", title: "New Spot", name: "Park", icon: "spot", cta: "Explore map", destination: "map", stars: 15 }
    ];
    const next = milestones.find((item) => !previewClaimedMilestones.includes(item.id));
    return {
      currentStreak: previewClaimedMilestones.length ? 1 : 0,
      totalStars: previewClaimedMilestones.reduce((sum, id) => {
        var _a;
        return sum + (((_a = milestones.find((item) => item.id === id)) == null ? void 0 : _a.stars) || 0);
      }, 0),
      canClaimMilestone: Boolean(next),
      nextMilestone: next || null,
      milestones: milestones.map((item) => __spreadProps(__spreadValues({}, item), {
        status: previewClaimedMilestones.includes(item.id) ? "claimed" : item.id === (next == null ? void 0 : next.id) ? "active" : "locked"
      })),
      unlockedLocations: previewClaimedMilestones.includes("new-spot") ? ["park"] : []
    };
  }
  function renderDailyRewards(status) {
    dailyRewardsStatus = status;
    if (!status) return;
    dailyRewardsStreakText.textContent = "Streak: ".concat(status.currentStreak, " day").concat(status.currentStreak === 1 ? "" : "s");
    dailyRewardsStarsText.textContent = "\u2B50 ".concat(status.totalStars, " stars");
    if (status.currentStreak > 0) {
      dailyRewardsStreakBadge.hidden = false;
      dailyRewardsStreakBadge.textContent = String(status.currentStreak);
    } else {
      dailyRewardsStreakBadge.hidden = true;
    }
    dailyRewardsBtn.classList.toggle("has-claim", status.canClaimMilestone);
    const milestoneByDay = new Map(
      (Array.isArray(status.milestones) ? status.milestones : []).filter((slot) => REWARD_SLOT_CARD_ASSETS[Number(slot == null ? void 0 : slot.day)]).map((slot) => [Number(slot.day), slot])
    );
    const claimedIds = new Set(Array.isArray(status.claimedMilestones) ? status.claimedMilestones : []);
    const milestones = REWARD_SLOT_DEFAULTS.map((fallback) => {
      var _a;
      const apiSlot = milestoneByDay.get(fallback.day);
      const fallbackStatus = claimedIds.has(fallback.id) ? "claimed" : ((_a = status.nextMilestone) == null ? void 0 : _a.id) === fallback.id ? "active" : "locked";
      return __spreadProps(__spreadValues(__spreadValues({}, fallback), apiSlot || {}), {
        day: fallback.day,
        status: (apiSlot == null ? void 0 : apiSlot.status) || fallbackStatus
      });
    });
    const needsRewardScrollbar = milestones.some(
      (slot) => slot.day === 7 && slot.status !== "locked"
    );
    dailyRewardsSlots.classList.toggle("show-scrollbar", needsRewardScrollbar);
    if (!needsRewardScrollbar) dailyRewardsSlots.scrollLeft = 0;
    const rewardsActions = document.querySelector(".daily-rewards-actions");
    const rewardsBoard = document.querySelector(".daily-rewards-board");
    if (rewardsActions && rewardsBoard && rewardsActions.parentElement !== rewardsBoard) {
      rewardsBoard.appendChild(rewardsActions);
    }
    dailyRewardsSlots.scrollLeft = 0;
    dailyRewardsSlots.innerHTML = milestones.map((slot) => {
      const asset = REWARD_SLOT_CARD_ASSETS[slot.day];
      if (!asset) return "";
      return '\n          <article class="daily-reward-slot '.concat(slot.status, '" data-status="').concat(slot.status, '" data-day="').concat(slot.day, '" aria-label="').concat(slot.day, " day reward: ").concat(slot.label, '">\n            <img class="daily-reward-slot-art" src="').concat(dailyRewardAsset(asset), '" alt="">\n            ').concat(slot.status === "claimed" ? '<div class="daily-reward-check" aria-label="Claimed">\u2713</div>' : "", '\n            <div class="daily-reward-slot-stars">+').concat(slot.stars, "\u2B50</div>\n          </article>\n        ");
    }).join("");
    const trackFill = document.getElementById("daily-rewards-track-fill");
    if (trackFill) {
      const claimedCount = milestones.filter((slot) => slot.status === "claimed").length;
      const activeIndex = milestones.findIndex((slot) => slot.status === "active");
      const progressIndex = activeIndex >= 0 ? activeIndex : Math.max(claimedCount - 1, 0);
      const fillPct = milestones.length <= 1 ? 8 : (progressIndex + 0.5) / milestones.length * 100;
      trackFill.style.width = "".concat(Math.max(8, Math.min(100, fillPct)), "%");
    }
    syncDailyRewardActionPosition();
    requestAnimationFrame(syncDailyRewardScrollbar);
    if (status.canClaimMilestone) {
      dailyRewardsClaimBtn.disabled = false;
      dailyRewardsClaimBtn.textContent = "Get";
    } else {
      dailyRewardsClaimBtn.disabled = true;
      dailyRewardsClaimBtn.textContent = "Got it!";
    }
  }
  function showDailyRewardsOverlay() {
    dailyRewardsOverlay.classList.add("visible");
    dailyRewardsOverlay.setAttribute("aria-hidden", "false");
  }
  function hideDailyRewardsOverlay() {
    dailyRewardsOverlay.classList.remove("visible");
    dailyRewardsOverlay.setAttribute("aria-hidden", "true");
  }
  function celebrateDailyReward() {
    sfx == null ? void 0 : sfx.play("victory", { interrupt: true });
    dailyRewardsCelebrate.innerHTML = "";
    const particleColors = ["#ffe66d", "#ff7a45", "#7ee74b", "#63d9ff", "#ff73bd", "#ffffff"];
    for (let i = 0; i < 30; i++) {
      const spark = document.createElement("span");
      spark.className = "daily-rewards-sparkle".concat(i % 4 === 0 ? " star" : "");
      spark.style.left = "".concat(12 + Math.random() * 76, "%");
      spark.style.top = "".concat(12 + Math.random() * 52, "%");
      spark.style.setProperty("--reward-particle", particleColors[i % particleColors.length]);
      spark.style.setProperty("--reward-drift", "".concat(-55 + Math.random() * 110, "px"));
      spark.style.setProperty("--reward-spin", "".concat(260 + Math.random() * 520, "deg"));
      spark.style.animationDelay = "".concat(Math.random() * 0.42, "s");
      dailyRewardsCelebrate.appendChild(spark);
    }
    setTimeout(() => {
      dailyRewardsCelebrate.innerHTML = "";
    }, 2400);
  }
  function showRewardCongratulations(reward) {
    const isWordWhack = reward.id === "word-whack";
    dailyRewardCongrats.classList.toggle("word-whack-layout", isWordWhack);
    dailyRewardCongratsTitle.textContent = reward.title;
    dailyRewardCongratsName.textContent = reward.name;
    dailyRewardModalCtaLabel.textContent = reward.cta;
    dailyRewardModalCta.setAttribute("aria-label", reward.cta);
    dailyRewardCongratsIcon.innerHTML = isWordWhack ? '<img src="/assets/daily-rewards/word-whack-modal-icon.png" alt="Word-Whack Blitz">' : '<span class="penguin" role="img" aria-label="Penguin doll">\u{1F427}</span>';
    dailyRewardCongrats.hidden = false;
    dailyRewardModalCta.focus({ preventScroll: true });
    dailyRewardCongrats.closest(".daily-rewards-scene").scrollTop = 0;
  }
  function closeRewardCongratulations() {
    dailyRewardCongrats.hidden = true;
    dailyRewardsClaimBtn.focus({ preventScroll: true });
    dailyRewardCongrats.closest(".daily-rewards-scene").scrollTop = 0;
  }
  async function fetchDailyRewardsStatus() {
    if (!dailyRewardsStudent) return null;
    try {
      const res = await fetch("/api/check-in");
      if (!res.ok) return null;
      const data = await res.json();
      renderDailyRewards(data);
      return data;
    } catch (e) {
      return null;
    }
  }
  async function claimDailyReward() {
    var _a;
    if (!(dailyRewardsStatus == null ? void 0 : dailyRewardsStatus.canClaimMilestone)) return;
    if (PREVIEW_MODE) {
      const reward = dailyRewardsStatus.nextMilestone;
      previewClaimedMilestones = [...previewClaimedMilestones, reward.id];
      renderDailyRewards(previewRewardStatus());
      celebrateDailyReward();
      if (reward.destination === "map") {
        localStorage.setItem("lango.systemUnlockedLocations", JSON.stringify(["park"]));
        if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
          window.LangoPageTransition.navigate("/map/?return=rewards");
        } else {
          window.location.href = "/map/?return=rewards";
        }
      } else {
        showRewardCongratulations(reward);
      }
      return;
    }
    dailyRewardsClaimBtn.disabled = true;
    dailyRewardsClaimBtn.textContent = "\u2026";
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim-milestone" })
      });
      if (!res.ok) throw new Error("Could not claim reward");
      const data = await res.json();
      renderDailyRewards(data.status);
      celebrateDailyReward();
      if (((_a = data.reward) == null ? void 0 : _a.destination) === "map") {
        localStorage.setItem("lango.systemUnlockedLocations", JSON.stringify(data.status.unlockedLocations || []));
        if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
          window.LangoPageTransition.navigate("/map/?return=rewards");
        } else {
          window.location.href = "/map/?return=rewards";
        }
        return;
      }
      if (data.reward) {
        showRewardCongratulations(data.reward);
      }
    } catch (e) {
      sfx == null ? void 0 : sfx.play("weakness", { interrupt: true });
      dailyRewardsClaimBtn.disabled = false;
      dailyRewardsClaimBtn.textContent = "Get";
    }
  }
  async function initDailyRewards({ autoShow = false } = {}) {
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) return;
      const me = await meRes.json();
      if (me.role !== "student") return;
      dailyRewardsStudent = true;
      document.body.classList.add("rewards-enabled");
      const status = await fetchDailyRewardsStatus();
      const returningFromMap = new URLSearchParams(location.search).get("openRewards") === "1";
      if (returningFromMap || autoShow && (status == null ? void 0 : status.canClaimMilestone)) {
        showDailyRewardsOverlay();
      }
    } catch (e) {
    }
  }
  dailyRewardsBtn.addEventListener("click", (event) => {
    if (event.isTrusted) sfx == null ? void 0 : sfx.play("powerUp");
    fetchDailyRewardsStatus().then(() => showDailyRewardsOverlay());
  });
  dailyRewardsClose.addEventListener("click", hideDailyRewardsOverlay);
  dailyRewardsOverlay.addEventListener("click", (e) => {
    if (e.target === dailyRewardsOverlay) {
      sfx == null ? void 0 : sfx.play("back");
      hideDailyRewardsOverlay();
    }
  });
  dailyRewardsClaimBtn.addEventListener("click", () => {
    sfx == null ? void 0 : sfx.play("next");
    claimDailyReward();
  });
  dailyRewardModalCta.addEventListener("click", () => {
    sfx == null ? void 0 : sfx.play("next");
    closeRewardCongratulations();
  });
  dailyRewardsSlots.addEventListener("scroll", () => requestAnimationFrame(syncDailyRewardScrollbar), { passive: true });
  var captionUserEl = document.getElementById("caption-user");
  var captionUserTextEl = document.getElementById("caption-user-text");
  var captionAgentEl = document.getElementById("caption-agent");
  var captionAgentTextEl = document.getElementById("caption-agent-text");
  var HAPPY = "happy";
  var KUNGFU = "kungfu";
  var PLAY_WORDWHACK = "play_wordwhack";
  var PLAY_CARDGAME = "play_cardgame";
  var PLAY_FINDGAME = "play_findgame";
  var END_CONVERSATION = "end_conversation";
  var DANCE_ANIMATIONS = [
    "/Animation/Dance/Booty%20Hip%20Hop%20Dance.fbx",
    "/Animation/Dance/Locking%20Hip%20Hop%20Dance.fbx",
    "/Animation/Dance/Snake%20Hip%20Hop%20Dance.fbx",
    "/Animation/Dance/Wave%20Hip%20Hop%20Dance.fbx",
    "/Animation/Dance/ChickenDance.fbx",
    "/Animation/Dance/Ymca%20Dance.fbx"
  ];
  var KUNGFU_ANIMATIONS = [
    "/Animation/KungFu/Standing%20Idle%20To%20Fight%20Idle.fbx",
    "/Animation/KungFu/Punch%20Combo.fbx"
  ];
  var BYEBYE_URL = "/Animation/byebye.fbx";
  var DEBUG_LOG_MAX = 80;
  var debugLogLines = [];
  var GAME_CATALOG = [
    {
      id: "wordwhack",
      name: "Word-Whack Blitz",
      sub: "Complete the sentence",
      url: "/games/",
      icon: "/games/assets/images/mole.svg",
      theme: "wordwhack"
    },
    {
      id: "cardgame",
      name: "Picture-Word Memory Match",
      sub: "Flip cards and match words",
      url: "/games/CardGame/",
      icon: "/games/CardGame/assets/images/card-back.svg",
      theme: "cardgame"
    },
    {
      id: "findgame",
      name: "Find the Object",
      sub: "Tap the right thing",
      url: "/games/FindGame/",
      icon: "/games/FindGame/assets/images/scene.svg",
      theme: "findgame"
    }
  ];
  function applyGameIconsFromConfig(gameIcons) {
    if (!gameIcons || typeof gameIcons !== "object") return;
    for (const game of GAME_CATALOG) {
      const custom = gameIcons[game.id];
      if (custom == null ? void 0 : custom.url) game.icon = custom.url;
    }
    document.querySelectorAll("[data-game-icon]").forEach((img) => {
      const game = GAME_CATALOG.find((g) => g.id === img.dataset.gameIcon);
      if (game) {
        img.src = game.icon;
        img.alt = game.name;
      }
    });
  }
  var idleVideoUrl = null;
  var transitionVideoUrl = null;
  var idleVideoHintText = "Tap to start conversation";
  var activeVideoPair = null;
  var videoPairsTimezone = "Asia/Hong_Kong";
  var videoSoundUnlocked = false;
  var videoSoundUnlockListenerAdded = false;
  var idleVideosReady = false;
  var idleVideoStarting = false;
  var playingTransitionVideo = false;
  var avatar = null;
  var avatarLoading = null;
  var cameraEditMode = false;
  var cameraEditBaseline = null;
  var avatarReadyMessage = "";
  var tripleClickCount = 0;
  var tripleClickTimer = null;
  var TRIPLE_CLICK_MS = 500;
  var ws;
  var ctx;
  var src;
  var proc;
  var source;
  var stream;
  var active = false;
  var inSession = false;
  var playing = false;
  var nextPlayTime = 0;
  var ENABLE_WAKE_WORD = false;
  var recognition = null;
  var wakeWordEnabled = ENABLE_WAKE_WORD;
  var listeningForWakeWord = false;
  var wakeWordRestartTimer = null;
  var wakeWordRestartAttempts = 0;
  var recognitionWatchdog = null;
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var WAKE_WORD = "hello";
  var queue = [];
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  var WAKE_WORD_RESTART_DELAY = IS_IOS ? 1500 : 500;
  var POST_SESSION_WAKE_DELAY = IS_IOS ? 3e3 : 800;
  var RECOGNITION_WATCHDOG_MS = IS_IOS ? 12e3 : 8e3;
  var responseId = null;
  var responseText = "";
  var responseAudioMs = 0;
  var speechPlaybackStart = 0;
  var speechStarted = false;
  var audioDone = false;
  var lipsyncRaf = null;
  var pendingEndConversation = false;
  var byebyeAnimationPromise = null;
  var endConversationCloseTimer = null;
  var pendingFunctionCalls = /* @__PURE__ */ new Map();
  var handledFunctionCallIds = /* @__PURE__ */ new Set();
  var END_CONVERSATION_FORCE_CLOSE_MS = 12e3;
  var IDLE_NUDGE_MS = 15e3;
  var MAX_IDLE_NUDGES = 4;
  var idleNudgeTimer = null;
  var idleNudgeCount = 0;
  var idleEndTimer = null;
  var launchingGame = false;
  var directSessionEntry = false;
  var lastChickenDanceAt = 0;
  var lastKungfuAt = 0;
  var cachedConfig = null;
  var connectPrep = null;
  var replayingPrepMessages = false;
  var CHICKEN_DANCE_COOLDOWN_MS = 2500;
  var KUNGFU_COOLDOWN_MS = 2500;
  var CAMERA_HEIGHT_STEP = 0.05;
  function pickRandomGame() {
    return GAME_CATALOG[Math.floor(Math.random() * GAME_CATALOG.length)];
  }
  function pickRandomDanceUrl() {
    return DANCE_ANIMATIONS[Math.floor(Math.random() * DANCE_ANIMATIONS.length)];
  }
  function pickRandomKungfuUrl() {
    return KUNGFU_ANIMATIONS[Math.floor(Math.random() * KUNGFU_ANIMATIONS.length)];
  }
  function animationNameFromUrl(url) {
    const file = decodeURIComponent(url.split("/").pop() || "");
    return file.replace(/\.fbx$/i, "");
  }
  function getGameById(id) {
    return GAME_CATALOG.find((g) => g.id === id) || null;
  }
  function spawnGameLaunchConfetti() {
    if (!gameLaunchConfetti) return;
    gameLaunchConfetti.replaceChildren();
    const colors = ["#6c8cff", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#fb7185"];
    for (let i = 0; i < 28; i++) {
      const piece = document.createElement("span");
      piece.style.left = "".concat(Math.random() * 100, "%");
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = "".concat(Math.random() * 0.45, "s");
      piece.style.animationDuration = "".concat(1.2 + Math.random() * 0.9, "s");
      gameLaunchConfetti.appendChild(piece);
    }
  }
  function setGameLaunchProgress(percent) {
    if (gameLaunchProgress) gameLaunchProgress.style.width = "".concat(percent, "%");
  }
  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function playGameLaunchTransition(game, { surprise = false } = {}) {
    if (!gameLaunchOverlay || !game) return;
    launchingGame = true;
    sfx == null ? void 0 : sfx.play("start", { interrupt: true });
    gameLaunchOverlay.classList.add("visible");
    gameLaunchOverlay.setAttribute("aria-hidden", "false");
    gameLaunchCard.className = "game-launch-card theme-".concat(game.theme);
    setGameLaunchProgress(8);
    spawnGameLaunchConfetti();
    if (surprise) {
      gameLaunchHeading.textContent = "Picking a surprise game\u2026";
      gameLaunchName.textContent = "";
      gameLaunchSub.textContent = "Uncle Tommy is spinning the wheel";
      gameLaunchReel.className = "game-launch-reel shuffling";
      const shuffleMs = 1800;
      const shuffleStart = performance.now();
      let shuffleIndex = 0;
      await new Promise((resolve) => {
        const tick = () => {
          const elapsed = performance.now() - shuffleStart;
          const candidate = GAME_CATALOG[shuffleIndex % GAME_CATALOG.length];
          gameLaunchIcon.src = candidate.icon;
          gameLaunchIcon.alt = candidate.name;
          shuffleIndex += 1;
          setGameLaunchProgress(8 + Math.min(52, elapsed / shuffleMs * 52));
          if (elapsed >= shuffleMs) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      gameLaunchReel.className = "game-launch-reel landed";
      gameLaunchIcon.src = game.icon;
      gameLaunchIcon.alt = game.name;
      gameLaunchHeading.textContent = "You got\u2026";
      gameLaunchName.textContent = game.name;
      gameLaunchSub.textContent = game.sub;
      setGameLaunchProgress(72);
      sfx == null ? void 0 : sfx.play("powerUp", { interrupt: true });
      spawnGameLaunchConfetti();
      await waitMs(900);
    } else {
      gameLaunchReel.className = "game-launch-reel landed";
      gameLaunchIcon.src = game.icon;
      gameLaunchIcon.alt = game.name;
      gameLaunchHeading.textContent = "Great choice!";
      gameLaunchName.textContent = game.name;
      gameLaunchSub.textContent = game.sub;
      setGameLaunchProgress(72);
      sfx == null ? void 0 : sfx.play("powerUp", { interrupt: true });
      await waitMs(700);
    }
    gameLaunchHeading.textContent = "Loading game!";
    gameLaunchSub.textContent = "Get ready to play";
    setGameLaunchProgress(100);
    sfx == null ? void 0 : sfx.play("next", { interrupt: true });
    await waitMs(650);
  }
  function navigateToGame(game) {
    if (!(game == null ? void 0 : game.url)) return;
    uiLog("game", "navigate \u2192 ".concat(game.url), "hello", { game: game.id });
    if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
      window.LangoPageTransition.navigate(game.url);
      return;
    }
    window.location.assign(game.url);
  }
  async function launchGame(reason = "user asked to play", chosenGame = null) {
    if (launchingGame) return null;
    const surprise = !chosenGame;
    const game = chosenGame || pickRandomGame();
    launchingGame = true;
    uiLog("game", "launch ".concat(game.id, " (").concat(reason, ")"), "hello", { surprise });
    setStatus("Launching ".concat(game.name, "\u2026"), true);
    sfx == null ? void 0 : sfx.play("start", { interrupt: true });
    try {
      ws == null ? void 0 : ws.close();
    } catch (e) {
    }
    navigateToGame(game);
    return game;
  }
  function cancelIdleNudge() {
    if (idleNudgeTimer) {
      clearTimeout(idleNudgeTimer);
      idleNudgeTimer = null;
    }
    if (idleEndTimer) {
      clearTimeout(idleEndTimer);
      idleEndTimer = null;
    }
  }
  function scheduleIdleNudge() {
    cancelIdleNudge();
    if (replayingPrepMessages || !active || pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) return;
    if (idleNudgeCount >= MAX_IDLE_NUDGES) {
      uiLog("idle", "nudge cap reached (".concat(MAX_IDLE_NUDGES, ") \u2014 scheduling end of conversation"), "warn");
      idleEndTimer = setTimeout(() => {
        idleEndTimer = null;
        if (!active || pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) return;
        if (playing || queue.length > 0) {
          scheduleIdleNudge();
          return;
        }
        uiLog("idle", "user silent after ".concat(MAX_IDLE_NUDGES, " nudges \u2192 suggesting farewell"), "warn");
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "[The user has been silent for a while after several check-ins. If they seem done, give a brief warm farewell and call end_conversation. Otherwise encourage them one more time.]" }]
          }
        }));
        ws.send(JSON.stringify({ type: "response.create" }));
        scheduleForceCloseAfterTool();
      }, IDLE_NUDGE_MS);
      return;
    }
    idleNudgeTimer = setTimeout(() => {
      idleNudgeTimer = null;
      if (!active || pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) return;
      if (playing || queue.length > 0) return;
      idleNudgeCount++;
      uiLog("idle", "user silent ".concat(IDLE_NUDGE_MS / 1e3, "s \u2192 nudge #").concat(idleNudgeCount), "hello");
      setStatus("No speech detected \u2014 Uncle Tommy is checking in", true);
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "[The user has been silent for ".concat(IDLE_NUDGE_MS / 1e3, " seconds. Briefly and warmly check in and encourage them to keep talking.]") }]
        }
      }));
      ws.send(JSON.stringify({ type: "response.create" }));
    }, IDLE_NUDGE_MS);
  }
  function wsStateLabel() {
    var _a;
    if (!ws) return "null";
    return (_a = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][ws.readyState]) != null ? _a : String(ws.readyState);
  }
  function snapshotHelloCycleState(extra = {}) {
    var _a, _b;
    return __spreadValues({
      active,
      inSession,
      wakeWordEnabled,
      listeningForWakeWord,
      wakeWordRestartAttempts,
      wakeWordRestartTimer: !!wakeWordRestartTimer,
      pendingEndConversation,
      playing,
      queueLen: queue.length,
      ws: wsStateLabel(),
      streamTracks: ((_a = stream == null ? void 0 : stream.getTracks) == null ? void 0 : _a.call(stream).map((t) => "".concat(t.kind, ":").concat(t.readyState)).join(", ")) || "none",
      ctx: (_b = ctx == null ? void 0 : ctx.state) != null ? _b : "null",
      recognition: recognition ? "alive" : "null"
    }, extra);
  }
  function uiLog(tag, message, level = "info", data) {
    const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const line = data !== void 0 ? "[".concat(ts, "] ").concat(tag, ": ").concat(message, " ").concat(JSON.stringify(data)) : "[".concat(ts, "] ").concat(tag, ": ").concat(message);
    console.log("[".concat(ts, "] ").concat(tag, ": ").concat(message), data != null ? data : "");
    debugLogLines.push(line);
    while (debugLogLines.length > DEBUG_LOG_MAX) debugLogLines.shift();
  }
  function collectDebugLogLines() {
    return debugLogLines.slice();
  }
  function setDebugUploadStatus(msg, isErr = false) {
    debugUploadStatusEl.textContent = msg;
    debugUploadStatusEl.classList.toggle("err", isErr);
  }
  async function sendDebugLogToServer() {
    const lines = collectDebugLogLines();
    if (!lines.length) {
      setDebugUploadStatus("No log lines yet", true);
      return;
    }
    btnSendLog.disabled = true;
    setDebugUploadStatus("Sending\u2026");
    try {
      const res = await fetch("/api/debug-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          state: snapshotHelloCycleState(),
          userAgent: navigator.userAgent
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDebugUploadStatus(data.error || "Upload failed", true);
        uiLog("debug", "upload failed: ".concat(data.error || res.status), "err");
        return;
      }
      setDebugUploadStatus("Sent \u2014 view in Settings");
      uiLog("debug", "upload ok (".concat(data.id, ")"), "hello");
    } catch (e) {
      setDebugUploadStatus("Could not reach server", true);
      uiLog("debug", "upload error: ".concat(e.message), "err");
    } finally {
      btnSendLog.disabled = false;
    }
  }
  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = msg ? "block" : "none";
    errIdleEl.textContent = msg;
    errIdleEl.style.display = msg ? "block" : "none";
  }
  function setStatus(msg, isActive = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("active", isActive);
    statusIdleEl.textContent = msg;
  }
  function setCaptionLine(el, textEl, text, { listening = false } = {}) {
    if (!el || !textEl) return;
    const trimmed = (text || "").trim();
    if (!trimmed && !listening) {
      el.hidden = true;
      el.classList.remove("visible", "caption-line--listening");
      textEl.textContent = "";
      return;
    }
    el.hidden = false;
    el.classList.add("visible");
    el.classList.toggle("caption-line--listening", listening);
    textEl.textContent = listening ? "Listening\u2026" : trimmed;
  }
  function clearConversationCaptions() {
    setCaptionLine(captionUserEl, captionUserTextEl, "");
    setCaptionLine(captionAgentEl, captionAgentTextEl, "");
  }
  function showUserHeard(transcript) {
    setCaptionLine(captionUserEl, captionUserTextEl, transcript);
  }
  function showUserListening() {
    setCaptionLine(captionUserEl, captionUserTextEl, "", { listening: true });
  }
  function updateAgentCaption(text) {
    setCaptionLine(captionAgentEl, captionAgentTextEl, text);
  }
  var PAIR_THEME_IDS = ["default", "warm", "cool", "nature", "night"];
  function normalizePairTheme(value) {
    const theme = String(value != null ? value : "").trim().toLowerCase();
    return PAIR_THEME_IDS.includes(theme) ? theme : "default";
  }
  function applyActivePairTheme(theme) {
    const normalized = normalizePairTheme(theme);
    for (const id of PAIR_THEME_IDS) {
      document.body.classList.toggle("pair-theme-".concat(id), id === normalized && id !== "default");
    }
  }
  function getAvatarBackgroundUrl(cfg) {
    var _a, _b;
    if ((_a = activeVideoPair == null ? void 0 : activeVideoPair.backgroundImage) == null ? void 0 : _a.url) {
      return activeVideoPair.backgroundImage.url;
    }
    return ((_b = cfg == null ? void 0 : cfg.avatarBackground) == null ? void 0 : _b.url) || null;
  }
  function applyActivePairBackground(cfg) {
    const bgUrl = getAvatarBackgroundUrl(cfg);
    applyAvatarStageBackground(bgUrl);
    avatar == null ? void 0 : avatar.setBackgroundUrl(bgUrl).catch(() => {
    });
    applyActivePairTheme(activeVideoPair == null ? void 0 : activeVideoPair.theme);
    return bgUrl;
  }
  function applyAvatarStageBackground(url) {
    avatarStageEl.style.backgroundColor = "#0b1222";
    avatarStageEl.classList.toggle("has-bg-image", Boolean(url));
    if (url) {
      avatarStageEl.style.backgroundImage = 'url("'.concat(url, '")');
    } else {
      avatarStageEl.style.backgroundImage = "none";
    }
  }
  function setIdleVideoMode(enabled) {
    document.body.classList.toggle("has-idle-video", enabled);
    if (enabled) showHkoWeatherBar();
  }
  function setTransitionVideoMode(enabled) {
    document.body.classList.toggle("playing-transition-video", enabled);
  }
  function setVideosLoading(loading) {
    document.body.classList.toggle("videos-loading", loading);
  }
  function preloadImage(url) {
    if (!url) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to preload image: ".concat(url)));
      img.src = url;
    });
  }
  function prefetchAsset(url) {
    if (!url) return Promise.resolve();
    return fetch(url).then(() => {
    }).catch((e) => {
      console.warn("Prefetch failed:", url, e);
    });
  }
  var splashProgressFill = document.getElementById("splash-progress-fill");
  var splashScreenEl = document.getElementById("splash-screen");
  function setSplashProgress(pct) {
    if (!splashProgressFill) return;
    const clamped = Math.max(0, Math.min(100, pct));
    splashProgressFill.style.width = "".concat(clamped, "%");
  }
  function dismissSplash() {
    setSplashProgress(100);
    if (splashScreenEl) splashScreenEl.setAttribute("aria-busy", "false");
    document.body.classList.add("splash-dismissed");
    window.dispatchEvent(new CustomEvent("lango:page-reveal"));
  }
  function applyVideoAudioSettings(videoEl) {
    videoEl.volume = 1;
    videoEl.muted = !videoSoundUnlocked;
  }
  function unlockVideoSound() {
    if (videoSoundUnlocked) return;
    videoSoundUnlocked = true;
    applyVideoAudioSettings(idleVideoEl);
    applyVideoAudioSettings(transitionVideoEl);
  }
  async function playVideoWithSound(videoEl) {
    videoEl.volume = 1;
    videoEl.muted = false;
    try {
      await videoEl.play();
      videoSoundUnlocked = true;
      return;
    } catch (e) {
    }
    videoEl.muted = true;
    await videoEl.play().catch(() => {
    });
  }
  function initVideoSoundUnlock() {
    if (videoSoundUnlockListenerAdded) return;
    videoSoundUnlockListenerAdded = true;
    const unlock = () => {
      unlockVideoSound();
      if (idleVideoUrl && !inSession && !active && !playingTransitionVideo && !idleVideoEl.paused) {
        idleVideoEl.muted = false;
        idleVideoEl.volume = 1;
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }
  function getHkoDisplayTimezone() {
    return "Asia/Hong_Kong";
  }
  function updateHkoDateTime() {
    if (!hkoWeatherDatetime) return;
    const now = /* @__PURE__ */ new Date();
    const tz = getHkoDisplayTimezone();
    const dateText = new Intl.DateTimeFormat("en-HK", {
      timeZone: tz,
      day: "numeric",
      month: "short"
    }).format(now);
    const timeText = new Intl.DateTimeFormat("en-HK", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(now);
    hkoWeatherDatetime.textContent = "".concat(dateText, " \xB7 ").concat(timeText);
    requestAnimationFrame(fitHkoWeatherDateTime);
  }
  function showHkoWeatherBar() {
    if (!hkoWeatherBar) return;
    updateHkoDateTime();
    hkoWeatherBar.hidden = false;
  }
  function fitHkoWeatherLine(element, sizeProperty, fallbackSize = 12) {
    if (!(element == null ? void 0 : element.clientWidth)) return;
    element.style.removeProperty(sizeProperty);
    let fontSize = parseFloat(getComputedStyle(element).fontSize) || fallbackSize;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (element.scrollWidth <= element.clientWidth || fontSize <= 8) break;
      fontSize = Math.max(8, fontSize * (element.clientWidth / element.scrollWidth) * 0.98);
      element.style.setProperty(sizeProperty, "".concat(fontSize, "px"));
    }
  }
  function fitHkoWeatherLocation() {
    fitHkoWeatherLine(hkoWeatherLocation, "--hko-weather-location-font-size");
  }
  function fitHkoWeatherDateTime() {
    fitHkoWeatherLine(hkoWeatherDatetime, "--hko-weather-datetime-font-size");
  }
  function fitHkoWeatherRow() {
    const row = hkoWeatherCondition == null ? void 0 : hkoWeatherCondition.closest(".hko-weather-row");
    if (!row || !row.clientWidth) return;
    row.style.removeProperty("--hko-weather-row-font-size");
    const items = [hkoWeatherCondition, ...row.querySelectorAll(".hko-weather-stat")];
    let fontSize = parseFloat(getComputedStyle(hkoWeatherCondition).fontSize) || 14;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const rowStyle = getComputedStyle(row);
      const gap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
      const requiredWidth = items.reduce((total, item) => total + item.scrollWidth, 0) + gap * Math.max(0, items.length - 1);
      if (requiredWidth <= row.clientWidth || fontSize <= 8) break;
      fontSize = Math.max(8, fontSize * (row.clientWidth / requiredWidth) * 0.98);
      row.style.setProperty("--hko-weather-row-font-size", "".concat(fontSize, "px"));
    }
  }
  function renderHkoWeather(data) {
    var _a;
    if (!hkoWeatherBar || !data || data.temperature == null || data.humidity == null) return;
    hkoWeatherCondition.textContent = data.condition || "Current weather";
    hkoWeatherTemp.textContent = "".concat(data.temperature, "\xB0").concat(data.temperatureUnit || "C");
    hkoWeatherHumidity.textContent = "".concat(data.humidity).concat(data.humidityUnit || "%");
    if (data.iconCode != null) {
      hkoWeatherIcon.src = "/api/weather/icon/".concat(data.iconCode);
      hkoWeatherIcon.alt = data.condition || "Weather icon";
      hkoWeatherIcon.hidden = false;
    } else {
      hkoWeatherIcon.hidden = true;
    }
    showHkoWeatherBar();
    requestAnimationFrame(() => {
      fitHkoWeatherLocation();
      fitHkoWeatherDateTime();
      fitHkoWeatherRow();
    });
    (_a = document.fonts) == null ? void 0 : _a.ready.then(() => requestAnimationFrame(() => {
      fitHkoWeatherLocation();
      fitHkoWeatherDateTime();
      fitHkoWeatherRow();
    })).catch(() => {
    });
  }
  async function loadHkoWeather() {
    try {
      const res = await fetch("/api/weather?lang=en");
      if (!res.ok) return;
      renderHkoWeather(await res.json());
    } catch (e) {
      console.warn("HKO weather:", e);
    }
  }
  function startIdleVideoPlayback() {
    if (!idleVideoUrl || inSession || active) return;
    playVideoWithSound(idleVideoEl);
  }
  async function preloadMediaAssets(cfg) {
    const rawTasks = [
      preloadImage("/langoLogo.jpeg").catch(() => {
      }),
      ...DANCE_ANIMATIONS.map(prefetchAsset),
      ...KUNGFU_ANIMATIONS.map(prefetchAsset),
      prefetchAsset(BYEBYE_URL),
      prefetchAsset("/Animation/Idle.fbx")
    ];
    applyGameIconsFromConfig(cfg.gameIcons);
    for (const game of GAME_CATALOG) {
      if (game.icon) rawTasks.push(preloadImage(game.icon).catch(() => {
      }));
    }
    rawTasks.push(setupIdleVideosFromConfig(cfg));
    const bgUrl = applyActivePairBackground(cfg);
    if (bgUrl) rawTasks.push(preloadImage(bgUrl).catch(() => {
    }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    rawTasks.push(
      ensureAvatar().catch((e) => {
        console.error(e);
        showErr("Avatar failed to load: ".concat(e.message));
      })
    );
    let done = 0;
    const total = rawTasks.length;
    const tasks = rawTasks.map(
      (task) => Promise.resolve(task).finally(() => {
        done += 1;
        setSplashProgress(10 + Math.round(done / total * 90));
      })
    );
    await Promise.all(tasks);
    setSplashProgress(100);
    return Boolean(idleVideoUrl);
  }
  function preloadVideoElement(video, url) {
    if (!url) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener("canplaythrough", onReady);
        video.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to preload video: ".concat(url)));
      };
      video.preload = "auto";
      if (video.dataset.preloadUrl !== url) {
        video.dataset.preloadUrl = url;
        video.src = url;
        video.load();
      }
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        onReady();
        return;
      }
      video.addEventListener("canplaythrough", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }
  function parseTimeToMinutes(value) {
    if (!value || typeof value !== "string") return null;
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }
  function getLocalMinutesInTimezone(date, timeZone) {
    var _a, _b, _c, _d;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const hour = Number((_b = (_a = parts.find((p) => p.type === "hour")) == null ? void 0 : _a.value) != null ? _b : 0);
    const minute = Number((_d = (_c = parts.find((p) => p.type === "minute")) == null ? void 0 : _c.value) != null ? _d : 0);
    return hour * 60 + minute;
  }
  function isPairActiveNow(pair, date = /* @__PURE__ */ new Date(), timeZone = videoPairsTimezone) {
    var _a, _b;
    const start = parseTimeToMinutes((_a = pair.startTime) != null ? _a : "00:00");
    const end = parseTimeToMinutes((_b = pair.endTime) != null ? _b : "23:59");
    if (start === null || end === null) return true;
    const now = getLocalMinutesInTimezone(date, timeZone);
    if (start === end) return true;
    if (start < end) return now >= start && now <= end;
    return now >= start || now <= end;
  }
  function pickVideoPair(videoPairs, date = /* @__PURE__ */ new Date()) {
    const eligible = (videoPairs || []).filter((p) => {
      var _a;
      return ((_a = p.loopVideo) == null ? void 0 : _a.url) && isPairActiveNow(p, date);
    });
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
  function getSessionInstructions(cfg) {
    var _a, _b;
    const systemPrompt = ((_a = cfg.instructions) == null ? void 0 : _a.trim()) || DEFAULT_PROMPT;
    const sessionPrompt = (_b = activeVideoPair == null ? void 0 : activeVideoPair.text) == null ? void 0 : _b.trim();
    if (!sessionPrompt) return systemPrompt;
    return "".concat(systemPrompt, "\n\nSession context:\n").concat(sessionPrompt);
  }
  var ROOM_SCENE_IDS = /* @__PURE__ */ new Set([
    "livingroom",
    "classroom",
    "library",
    "bedroom",
    "garden",
    "kitchen",
    "washroom"
  ]);
  function inferRoomSceneFromPrompt(value) {
    var _a;
    const prompt = String(value != null ? value : "").trim().toLowerCase();
    const sceneMatchers = [
      ["washroom", /\b(?:wash\s*room|bath\s*room|rest\s*room|toilet)\b|洗手間|浴室|廁所/],
      ["livingroom", /\b(?:living\s*room|lounge|sitting\s*room)\b|客廳|起居室/],
      ["classroom", /\b(?:class\s*room|school|lesson)\b|課室|教室|學校/],
      ["library", /\b(?:library|libary)\b|圖書館/],
      ["bedroom", /\b(?:bed\s*room)\b|睡房|臥室/],
      ["garden", /\b(?:garden|back\s*yard|courtyard)\b|花園|庭院/],
      ["kitchen", /\b(?:kitchen)\b|廚房/]
    ];
    return ((_a = sceneMatchers.find(([, matcher]) => matcher.test(prompt))) == null ? void 0 : _a[0]) || "livingroom";
  }
  function applyActivePairScene(pair) {
    var _a;
    const configuredScene = String((_a = pair == null ? void 0 : pair.scene) != null ? _a : "").trim().toLowerCase();
    const scene = ROOM_SCENE_IDS.has(configuredScene) ? configuredScene : inferRoomSceneFromPrompt(pair == null ? void 0 : pair.text);
    window.LangoRoomScene = scene;
    window.dispatchEvent(new CustomEvent("lango:room-scene", { detail: { scene } }));
    return scene;
  }
  function setupIdleVideosFromConfig(cfg, { autoplay = false } = {}) {
    activeVideoPair = pickVideoPair(cfg.videoPairs);
    let result;
    if (activeVideoPair) {
      result = setupIdleVideos(activeVideoPair.loopVideo, activeVideoPair.transitionVideo, {
        autoplay
      });
    } else {
      const hasConfiguredPairs = (cfg.videoPairs || []).some((p) => {
        var _a;
        return (_a = p.loopVideo) == null ? void 0 : _a.url;
      });
      if (hasConfiguredPairs) {
        activeVideoPair = null;
        idleVideoHintText = "Tap to start conversation";
        result = setupIdleVideos(null, null, { autoplay, hintText: idleVideoHintText });
      } else {
        activeVideoPair = null;
        idleVideoHintText = "Tap to start conversation";
        result = setupIdleVideos(cfg.idleVideo, cfg.transitionVideo, { autoplay, hintText: idleVideoHintText });
      }
    }
    applyActivePairScene(activeVideoPair);
    applyActivePairBackground(cfg);
    return result;
  }
  async function setupIdleVideos(idleVideo, transitionVideo, { autoplay = true, hintText = "Tap to start conversation" } = {}) {
    transitionVideoUrl = (transitionVideo == null ? void 0 : transitionVideo.url) || null;
    idleVideosReady = false;
    idleVideoHintText = (hintText == null ? void 0 : hintText.trim()) || "Tap to start conversation";
    if (idleVideoHint) idleVideoHint.textContent = idleVideoHintText;
    if (!(idleVideo == null ? void 0 : idleVideo.url)) {
      idleVideoUrl = null;
      setIdleVideoMode(false);
      setVideosLoading(false);
      idleVideoEl.removeAttribute("src");
      transitionVideoEl.removeAttribute("src");
      return false;
    }
    idleVideoUrl = idleVideo.url;
    setIdleVideoMode(true);
    setVideosLoading(true);
    if (idleVideoLoadingEl) idleVideoLoadingEl.textContent = "Loading videos\u2026";
    idleVideoEl.loop = true;
    transitionVideoEl.loop = false;
    applyVideoAudioSettings(idleVideoEl);
    applyVideoAudioSettings(transitionVideoEl);
    transitionVideoEl.pause();
    const preloadTasks = [preloadVideoElement(idleVideoEl, idleVideo.url)];
    if (transitionVideoUrl) {
      preloadTasks.push(preloadVideoElement(transitionVideoEl, transitionVideoUrl));
    }
    try {
      await Promise.all(preloadTasks);
    } catch (e) {
      console.warn("Video preload failed:", e);
      uiLog("hello", "video preload warning: ".concat(e.message), "warn");
    }
    idleVideosReady = true;
    setVideosLoading(false);
    transitionVideoEl.pause();
    transitionVideoEl.currentTime = 0;
    if (autoplay) {
      try {
        await playVideoWithSound(idleVideoEl);
      } catch (e) {
      }
    }
    return true;
  }
  function resetIdleVideoElement() {
    if (!idleVideoUrl) return;
    playingTransitionVideo = false;
    setTransitionVideoMode(false);
    transitionVideoEl.onended = null;
    transitionVideoEl.onerror = null;
    transitionVideoEl.pause();
    transitionVideoEl.currentTime = 0;
    idleVideoHint.hidden = false;
    idleVideoHint.textContent = idleVideoHintText;
    idleVideoScreen.style.cursor = "pointer";
  }
  function dismissIdleVideoScreen() {
    document.body.classList.add("idle-video-dismissed");
    idleVideoEl.pause();
    transitionVideoEl.pause();
    playingTransitionVideo = false;
    setTransitionVideoMode(false);
  }
  function restoreIdleVideoScreen() {
    document.body.classList.remove("idle-video-dismissed");
  }
  function abortPreparedConversationView() {
    abortConnectPrep();
    exitSessionView();
    const skipIdle = directSessionEntry;
    directSessionEntry = false;
    if (skipIdle || !idleVideoUrl || active) return;
    restoreIdleVideoScreen();
    resetIdleVideoElement();
    playVideoWithSound(idleVideoEl);
  }
  async function playTransitionVideo() {
    const HANDOFF_BEFORE_END_SEC = 0.25;
    return new Promise((resolve, reject) => {
      playingTransitionVideo = true;
      setTransitionVideoMode(true);
      idleVideoHint.hidden = true;
      idleVideoScreen.style.cursor = "default";
      idleVideoEl.pause();
      transitionVideoEl.currentTime = 0;
      unlockVideoSound();
      transitionVideoEl.muted = false;
      transitionVideoEl.volume = 1;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        transitionVideoEl.onended = null;
        transitionVideoEl.onerror = null;
        transitionVideoEl.removeEventListener("timeupdate", onTimeUpdate);
        transitionVideoEl.pause();
        resolve();
      };
      const onTimeUpdate = () => {
        const remaining = transitionVideoEl.duration - transitionVideoEl.currentTime;
        if (Number.isFinite(remaining) && remaining <= HANDOFF_BEFORE_END_SEC) finish();
      };
      transitionVideoEl.addEventListener("timeupdate", onTimeUpdate);
      transitionVideoEl.onended = finish;
      transitionVideoEl.onerror = () => {
        transitionVideoEl.onended = null;
        transitionVideoEl.onerror = null;
        transitionVideoEl.removeEventListener("timeupdate", onTimeUpdate);
        reject(new Error("Transition video failed to play."));
      };
      transitionVideoEl.play().catch(reject);
    });
  }
  async function connectConversationAfterVideos() {
    wakeWordEnabled = false;
    wakeWordRestartAttempts = 0;
    stopWakeWordListening();
    dismissIdleVideoScreen();
    await Promise.all([
      enterSessionView(),
      connectConversation({ preparedView: true })
    ]);
  }
  function shouldAutoConnectFromGame() {
    return new URLSearchParams(location.search).has("connect");
  }
  function clearAutoConnectParam() {
    if (!shouldAutoConnectFromGame()) return;
    const url = new URL(location.href);
    url.searchParams.delete("connect");
    const next = url.pathname + url.search + url.hash;
    history.replaceState(null, "", next || "/");
  }
  async function autoConnectFromGameReturn() {
    if (!shouldAutoConnectFromGame() || active) return;
    uiLog("hello", "auto-connect from game return", "hello");
    clearAutoConnectParam();
    wakeWordEnabled = false;
    wakeWordRestartAttempts = 0;
    stopWakeWordListening();
    dismissIdleVideoScreen();
    setIdleVideoMode(false);
    setVideosLoading(false);
    directSessionEntry = true;
    beginConnectPrep().catch(() => {
    });
    await Promise.all([
      enterSessionView(),
      connectConversation({ preparedView: true })
    ]);
  }
  async function startConversationFromIdleTap() {
    if (active || idleVideoStarting || playingTransitionVideo || !idleVideosReady) return;
    idleVideoStarting = true;
    uiLog("hello", "idle video tapped", "hello");
    beginConnectPrep().catch((e) => {
      uiLog("hello", "connect prep: ".concat((e == null ? void 0 : e.message) || e), "warn");
    });
    try {
      if (transitionVideoUrl) {
        uiLog("hello", "playing transition video (mic + ws warming in parallel)", "hello");
        try {
          await playTransitionVideo();
        } catch (e) {
          uiLog("hello", "transition video error: ".concat(e.message), "warn");
        }
      }
      uiLog("hello", "transition complete \u2192 connectConversation", "hello");
      await connectConversationAfterVideos();
    } catch (e) {
      uiLog("hello", "start from idle failed: ".concat((e == null ? void 0 : e.message) || e), "err");
      abortConnectPrep();
      abortPreparedConversationView();
      showErr("Could not connect. Try again.");
      resumeWakeWordListening();
    } finally {
      idleVideoStarting = false;
    }
  }
  idleVideoScreen.addEventListener("click", (e) => {
    if (playingTransitionVideo || e.target.closest("button, a, input, select, textarea")) return;
    startConversationFromIdleTap();
  });
  async function refreshIdleVideosForCurrentPeriod() {
    var _a, _b;
    if (inSession || active || playingTransitionVideo || idleVideoStarting) return;
    const cfg = cachedConfig || await getConfig();
    const nextPair = pickVideoPair(cfg.videoPairs);
    const nextId = (_a = nextPair == null ? void 0 : nextPair.id) != null ? _a : null;
    const currentId = (_b = activeVideoPair == null ? void 0 : activeVideoPair.id) != null ? _b : null;
    if (nextId === currentId) {
      if (nextPair) {
        activeVideoPair = nextPair;
        applyActivePairScene(nextPair);
        applyActivePairBackground(cfg);
        applyActivePairTheme(nextPair.theme);
      }
      return;
    }
    const wasPlaying = Boolean(idleVideoUrl) && !document.body.classList.contains("idle-video-dismissed");
    await setupIdleVideosFromConfig(cfg, { autoplay: wasPlaying });
    if (wasPlaying && idleVideoUrl) {
      restoreIdleVideoScreen();
      resetIdleVideoElement();
      playVideoWithSound(idleVideoEl);
    }
  }
  function resumeIdleVideo() {
    if (inSession || active) return;
    refreshIdleVideosForCurrentPeriod().then(() => {
      if (!idleVideoUrl) return;
      restoreIdleVideoScreen();
      resetIdleVideoElement();
      idleVideoEl.currentTime = 0;
      playVideoWithSound(idleVideoEl);
    });
  }
  function loadAvatarFromLocalStorage() {
    try {
      return normalizeAvatar(JSON.parse(localStorage.getItem(AVATAR_KEY) || "{}"));
    } catch (e) {
      return __spreadValues({}, DEFAULT_AVATAR);
    }
  }
  function loadLipsyncFromLocalStorage() {
    try {
      return normalizeLipsync(JSON.parse(localStorage.getItem(LIPSYNC_KEY) || "{}"));
    } catch (e) {
      return normalizeLipsync({});
    }
  }
  async function saveCameraSettings() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!(avatar == null ? void 0 : avatar.loaded)) {
      cameraSaveStatusEl.textContent = "Avatar not ready";
      cameraSaveStatusEl.className = "err";
      return;
    }
    const cameraSettings = normalizeAvatar(avatar.getCameraSettings());
    btnSaveCamera.disabled = true;
    cameraSaveStatusEl.textContent = "Saving\u2026";
    cameraSaveStatusEl.className = "";
    const cfg = await getConfig();
    const payload = {
      apiKey: ((_a = cfg.apiKey) == null ? void 0 : _a.trim()) || ((_b = localStorage.getItem(KEY)) == null ? void 0 : _b.trim()) || "",
      instructions: (_d = (_c = cfg.instructions) != null ? _c : localStorage.getItem(PROMPT_KEY)) != null ? _d : "",
      voice: (_f = (_e = cfg.voice) != null ? _e : localStorage.getItem(VOICE_KEY)) != null ? _f : "",
      model: (_h = (_g = cfg.model) != null ? _g : localStorage.getItem(MODEL_KEY)) != null ? _h : "",
      avatar: cameraSettings,
      lipsync: loadLipsyncFromLocalStorage(),
      lighting: cfg.lighting
    };
    if (!payload.apiKey) {
      cameraSaveStatusEl.textContent = "Set API key in Settings";
      cameraSaveStatusEl.className = "err";
      btnSaveCamera.disabled = false;
      return;
    }
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("save failed");
      localStorage.setItem(AVATAR_KEY, JSON.stringify(cameraSettings));
      cameraSaveStatusEl.textContent = "Saved";
      cameraSaveStatusEl.className = "";
      setTimeout(() => {
        if (cameraSaveStatusEl.textContent === "Saved") cameraSaveStatusEl.textContent = "";
      }, 2500);
    } catch (e) {
      localStorage.setItem(AVATAR_KEY, JSON.stringify(cameraSettings));
      cameraSaveStatusEl.textContent = "Saved locally";
      cameraSaveStatusEl.className = "";
    } finally {
      btnSaveCamera.disabled = false;
    }
  }
  btnSaveCamera.addEventListener("click", saveCameraSettings);
  function cancelCameraEdit() {
    if (!cameraEditMode) return;
    if ((avatar == null ? void 0 : avatar.loaded) && cameraEditBaseline) {
      avatar.applyCameraSettings(cameraEditBaseline);
    }
    setCameraEditMode(false);
  }
  btnCancelCamera.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelCameraEdit();
  });
  function nudgeCameraHeight(deltaY) {
    if (!cameraEditMode || !(avatar == null ? void 0 : avatar.loaded)) return;
    avatar.nudgeCameraHeight(deltaY);
  }
  btnCameraUp.addEventListener("click", (e) => {
    e.stopPropagation();
    nudgeCameraHeight(CAMERA_HEIGHT_STEP);
  });
  btnCameraDown.addEventListener("click", (e) => {
    e.stopPropagation();
    nudgeCameraHeight(-CAMERA_HEIGHT_STEP);
  });
  function updateAvatarStatusDisplay() {
    if (cameraEditMode) {
      avatarStatusEl.textContent = "Camera edit \xB7 drag to pan \xB7 pinch to zoom \xB7 \u25B2\u25BC height \xB7 Cancel to discard";
    } else if (avatarReadyMessage) {
      avatarStatusEl.textContent = avatarReadyMessage;
    } else {
      avatarStatusEl.textContent = "";
    }
  }
  function setCameraEditMode(enabled) {
    if (enabled && (avatar == null ? void 0 : avatar.loaded)) {
      cameraEditBaseline = normalizeAvatar(avatar.getCameraSettings());
    }
    cameraEditMode = enabled;
    document.body.classList.toggle("camera-edit-mode", enabled);
    avatar == null ? void 0 : avatar.setInteractiveCamera(enabled);
    if (!enabled) {
      cameraEditBaseline = null;
      cameraSaveStatusEl.textContent = "";
    }
    updateAvatarStatusDisplay();
  }
  function handleTripleClick() {
    setCameraEditMode(!cameraEditMode);
  }
  function onAvatarStageClick(e) {
    var _a, _b;
    if ((_b = (_a = e == null ? void 0 : e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, "button, a, input, select, textarea")) return;
    tripleClickCount += 1;
    clearTimeout(tripleClickTimer);
    if (tripleClickCount >= 3) {
      tripleClickCount = 0;
      handleTripleClick();
      return;
    }
    tripleClickTimer = setTimeout(() => {
      tripleClickCount = 0;
    }, TRIPLE_CLICK_MS);
  }
  document.getElementById("session-overlay").addEventListener("click", onAvatarStageClick);
  document.getElementById("vrm-canvas").addEventListener("click", onAvatarStageClick);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !cameraEditMode) return;
    e.preventDefault();
    cancelCameraEdit();
  });
  async function ensureAvatar() {
    if (avatar) return avatar;
    if (avatarLoading) return avatarLoading;
    avatarLoading = (async () => {
      const cfg = cachedConfig || await getConfig();
      const av = normalizeAvatar(cfg.avatar);
      const lipsync = normalizeLipsync(cfg.lipsync);
      const lighting = normalizeLighting(cfg.lighting);
      const backgroundUrl = getAvatarBackgroundUrl(cfg);
      applyAvatarStageBackground(backgroundUrl);
      avatar = new TommyAvatar(document.getElementById("vrm-canvas"), __spreadProps(__spreadValues({}, av), {
        lipsync,
        lighting,
        backgroundUrl,
        interactiveCamera: false
      }));
      avatar.onStatus = (msg) => {
        avatarReadyMessage = msg === "Avatar ready" ? "" : msg;
        updateAvatarStatusDisplay();
      };
      await avatar.load();
      return avatar;
    })();
    return avatarLoading;
  }
  async function enterSessionView() {
    var _a, _b;
    if (inSession) {
      avatar == null ? void 0 : avatar.refreshAfterVisible();
      return;
    }
    inSession = true;
    document.body.classList.add("in-session");
    if (!(avatar == null ? void 0 : avatar.loaded)) setStatus("Loading avatar\u2026");
    await new Promise((r) => requestAnimationFrame(r));
    try {
      await ensureAvatar();
      avatar.refreshAfterVisible();
    } catch (e) {
      console.error(e);
      showErr("Avatar failed to load: ".concat(e.message));
    }
    try {
      await ((_b = (_a = screen.orientation) == null ? void 0 : _a.lock) == null ? void 0 : _b.call(_a, "landscape"));
    } catch (e) {
    }
    avatar == null ? void 0 : avatar.refreshAfterVisible();
  }
  function exitSessionView() {
    var _a, _b;
    if (!inSession) return;
    inSession = false;
    setCameraEditMode(false);
    document.body.classList.remove("in-session");
    try {
      (_b = (_a = screen.orientation) == null ? void 0 : _a.unlock) == null ? void 0 : _b.call(_a);
    } catch (e) {
    }
  }
  function releaseMicSync() {
    try {
      proc == null ? void 0 : proc.disconnect();
    } catch (e) {
      console.warn("proc disconnect failed", e);
    }
    try {
      source == null ? void 0 : source.disconnect();
    } catch (e) {
      console.warn("source disconnect failed", e);
    }
    proc = null;
    source = null;
    try {
      stream == null ? void 0 : stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn("stream stop failed", e);
    }
    stream = null;
    try {
      if ((ctx == null ? void 0 : ctx.state) !== "closed") ctx == null ? void 0 : ctx.close();
    } catch (e) {
      console.warn("ctx close failed", e);
    }
    ctx = null;
  }
  function cleanupSession({ keepSessionView = false } = {}) {
    uiLog("cleanup", "begin", "hello", { keepSessionView });
    abortConnectPrep();
    clearConversationCaptions();
    directSessionEntry = false;
    active = false;
    pendingEndConversation = false;
    pendingFunctionCalls.clear();
    handledFunctionCallIds.clear();
    cancelIdleNudge();
    idleNudgeCount = 0;
    if (endConversationCloseTimer) {
      clearTimeout(endConversationCloseTimer);
      endConversationCloseTimer = null;
    }
    byebyeAnimationPromise = null;
    try {
      stopAudio();
    } catch (e) {
      console.warn("stopAudio failed", e);
    }
    try {
      stopAvatarSpeech();
    } catch (e) {
      console.warn("stopAvatarSpeech failed", e);
    }
    resetResponseState(null);
    if (!keepSessionView) exitSessionView();
    releaseMicSync();
    ws = null;
    btnStart.textContent = "Start Conversation";
    btnStart.disabled = false;
    uiLog("cleanup", "done \u2014 ready for hello cycle", "hello");
  }
  function startByebyeAnimation() {
    if (byebyeAnimationPromise) return byebyeAnimationPromise;
    uiLog("end", "starting byebye animation alongside farewell", "hello");
    byebyeAnimationPromise = (async () => {
      const played = await (avatar == null ? void 0 : avatar.playMixamoAnimation(BYEBYE_URL, { resumeIdle: false }));
      if (!played) uiLog("end", "byebye animation failed to play", "warn");
      return played;
    })();
    return byebyeAnimationPromise;
  }
  async function finishByebyeAndReturnToHelloCycle() {
    uiLog("end", "farewell done \u2014 waiting for byebye then loop video", "hello");
    try {
      await ensureAvatar();
      inSession = true;
      document.body.classList.add("in-session");
      avatar == null ? void 0 : avatar.refreshAfterVisible();
      if (!byebyeAnimationPromise) startByebyeAnimation();
      await byebyeAnimationPromise;
    } catch (e) {
      uiLog("end", "byebye animation error: ".concat((e == null ? void 0 : e.message) || e), "warn");
    } finally {
      byebyeAnimationPromise = null;
      exitSessionView();
      returnToHelloCycle();
    }
  }
  function returnToHelloCycle() {
    uiLog("hello", "returnToHelloCycle", "hello");
    showErr("");
    resumeIdleVideo();
    if (dailyRewardsStudent) fetchDailyRewardsStatus();
    wakeWordEnabled = ENABLE_WAKE_WORD;
    wakeWordRestartAttempts = 0;
    stopWakeWordListening();
    setStatus(ENABLE_WAKE_WORD ? 'Say "Hello" to start a conversation' : 'Tap "Start" to begin a conversation');
    if (!ENABLE_WAKE_WORD) return;
    if (wakeWordRestartTimer) clearTimeout(wakeWordRestartTimer);
    wakeWordRestartTimer = setTimeout(() => {
      wakeWordRestartTimer = null;
      uiLog("hello", "restart timer fired (delay ".concat(POST_SESSION_WAKE_DELAY, "ms)"), "hello", snapshotHelloCycleState());
      if (wakeWordEnabled && !active) startWakeWordListening();
      else uiLog("hello", "restart timer skipped", "warn", snapshotHelloCycleState());
    }, POST_SESSION_WAKE_DELAY);
  }
  function closeAfterToolEnd() {
    if (replayingPrepMessages) return;
    if (!pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) {
      if (pendingEndConversation) {
        uiLog("end", "closeAfterToolEnd blocked", "warn", {
          ws: wsStateLabel(),
          playing,
          queueLen: queue.length
        });
      }
      return;
    }
    if (playing || queue.length > 0) {
      uiLog("end", "closeAfterToolEnd waiting for audio", "hello", { playing, queueLen: queue.length });
      if (!endConversationCloseTimer) scheduleForceCloseAfterTool();
      return;
    }
    if (endConversationCloseTimer) {
      clearTimeout(endConversationCloseTimer);
      endConversationCloseTimer = null;
    }
    uiLog("end", "closeAfterToolEnd \u2192 ws.close()", "hello");
    ws.close();
  }
  function scheduleForceCloseAfterTool() {
    if (endConversationCloseTimer) return;
    uiLog("end", "schedule force close in ".concat(END_CONVERSATION_FORCE_CLOSE_MS / 1e3, "s"), "hello");
    endConversationCloseTimer = setTimeout(() => {
      endConversationCloseTimer = null;
      if (!pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) {
        uiLog("end", "force close skipped", "warn", snapshotHelloCycleState());
        return;
      }
      uiLog("end", "force close \u2192 stopAudio + ws.close()", "warn");
      stopAudio();
      ws.close();
    }, END_CONVERSATION_FORCE_CLOSE_MS);
  }
  function trackFunctionCallItem(item) {
    if (!item || item.type !== "function_call") return;
    const callId = item.call_id || item.id;
    if (!callId) return;
    pendingFunctionCalls.set(item.id || callId, {
      name: item.name,
      call_id: callId
    });
  }
  function resolveFunctionCall(event) {
    const tracked = pendingFunctionCalls.get(event.item_id);
    return {
      name: event.name || (tracked == null ? void 0 : tracked.name),
      call_id: event.call_id || (tracked == null ? void 0 : tracked.call_id) || event.item_id,
      arguments: event.arguments || "{}"
    };
  }
  function isDanceRequest(text) {
    const t = text.toLowerCase().trim();
    if (!t) return false;
    if (/\b(no|don't|dont|not|never|stop)\b.*\bdance\b/.test(t) || /\bdance\b.*\b(no|don't|dont|not|never|stop)\b/.test(t)) {
      return false;
    }
    if (/\bchicken dance\b/.test(t) || /\bdo the chicken\b/.test(t)) return true;
    if (/^(dance|dance!?|dance please)\.?$/i.test(t)) return true;
    if (/\bdance\b/.test(t)) {
      return /\b(do|can you|please|let'?s|show|chicken|time to|want to|wanna|for me|uncle tommy|tommy)\b/.test(t);
    }
    return /\b(do a dance|funny dance|your dance|shake it|bust a move)\b/.test(t);
  }
  function isFightRequest(text) {
    const t = text.toLowerCase().trim();
    if (!t) return false;
    if (/\b(no|don't|dont|not|never|stop)\b.*\b(fight|kung\s*fu|punch|karate)\b/.test(t) || /\b(fight|kung\s*fu|punch|karate)\b.*\b(no|don't|dont|not|never|stop)\b/.test(t)) {
      return false;
    }
    if (/\bkung\s*fu\b/.test(t) || /\bkarate\b/.test(t) || /\bmartial arts\b/.test(t)) return true;
    if (/\bpunch\b/.test(t)) return true;
    if (/^(fight|fight!?|fight please)\.?$/i.test(t)) return true;
    if (/\bfight\b/.test(t)) {
      return /\b(do|can you|please|let'?s|show|want to|wanna|for me|uncle tommy|tommy|with me)\b/.test(t);
    }
    return /\b(do a fight|fight move|fighting stance|show me your moves)\b/.test(t);
  }
  function isGoodbyeRequest(text) {
    const t = text.toLowerCase().trim();
    if (!t) return false;
    if (/\b(don'?t|dont|not|never|no)\b.*\b(bye|goodbye|leave|go)\b/.test(t) || /\b(bye|goodbye|leave|go)\b.*\b(don'?t|dont|not|never|no)\b/.test(t)) {
      return false;
    }
    if (/\b(bye[\s-]?bye|good[\s-]?bye)\b/.test(t)) return true;
    if (/^bye!?\.?$/i.test(t)) return true;
    if (/\bsee you\b|\bsee ya\b|\bcya\b/.test(t)) return true;
    if (/\b(gotta go|got to go|have to go|need to go|i'?m leaving|im leaving|time to go|must go)\b/.test(t)) return true;
    if (/\b(that'?s all|thats all|we'?re done|were done|stop talking|end (the )?conversation)\b/.test(t)) return true;
    if (/\b(nice to see you|good to see you|take care of|talk later about)\b/.test(t)) return false;
    return false;
  }
  function triggerEndConversation(reason = "user said goodbye") {
    if (replayingPrepMessages || pendingEndConversation || (ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) return;
    uiLog("end", "goodbye detected (".concat(reason, ")"), "hello");
    pendingEndConversation = true;
    setStatus("Goodbye!");
    startByebyeAnimation();
    closeAfterToolEnd();
    setTimeout(closeAfterToolEnd, 1500);
    scheduleForceCloseAfterTool();
  }
  function triggerChickenDance(reason = "user asked to dance") {
    const now = Date.now();
    if (now - lastChickenDanceAt < CHICKEN_DANCE_COOLDOWN_MS) return;
    lastChickenDanceAt = now;
    const danceUrl = pickRandomDanceUrl();
    uiLog("dance", "".concat(animationNameFromUrl(danceUrl), " (").concat(reason, ")"), "hello");
    avatar == null ? void 0 : avatar.playMixamoAnimation(danceUrl);
  }
  function triggerKungfu(reason = "user asked to fight") {
    const now = Date.now();
    if (now - lastKungfuAt < KUNGFU_COOLDOWN_MS) return;
    lastKungfuAt = now;
    const kungfuUrl = pickRandomKungfuUrl();
    uiLog("kungfu", "".concat(animationNameFromUrl(kungfuUrl), " (").concat(reason, ")"), "hello");
    avatar == null ? void 0 : avatar.playMixamoAnimation(kungfuUrl);
  }
  function resetResponseState(id) {
    responseId = id != null ? id : null;
    responseText = "";
    responseAudioMs = 0;
    speechStarted = false;
    audioDone = false;
    speechPlaybackStart = 0;
    if (id) updateAgentCaption("");
  }
  function syncLipsyncTimeline() {
    if (!responseText.trim() || !avatar) return;
    avatar.updateSpeechText(responseText, responseAudioMs);
  }
  function startLipsyncClock() {
    if (lipsyncRaf) return;
    const tick = () => {
      if ((avatar == null ? void 0 : avatar.speaking) && ctx && speechPlaybackStart > 0) {
        avatar.setSpeechElapsedMs(Math.max(0, (ctx.currentTime - speechPlaybackStart) * 1e3));
      }
      lipsyncRaf = requestAnimationFrame(tick);
    };
    lipsyncRaf = requestAnimationFrame(tick);
  }
  function stopLipsyncClock() {
    if (lipsyncRaf) {
      cancelAnimationFrame(lipsyncRaf);
      lipsyncRaf = null;
    }
  }
  function beginAvatarSpeech() {
    if (speechStarted || !avatar) return;
    speechStarted = true;
    speechPlaybackStart = Math.max(ctx.currentTime, nextPlayTime);
    syncLipsyncTimeline();
    avatar.beginSpeech();
    startLipsyncClock();
  }
  function maybeEndAvatarSpeech() {
    if (!speechStarted || !avatar) return;
    if (audioDone && !playing && queue.length === 0) {
      stopLipsyncClock();
      avatar.endSpeech();
      speechStarted = false;
    }
  }
  function stopAvatarSpeech() {
    stopLipsyncClock();
    avatar == null ? void 0 : avatar.endSpeech();
    speechStarted = false;
    audioDone = false;
  }
  function handleNewResponse(id) {
    if (id && id !== responseId) {
      stopAvatarSpeech();
      resetResponseState(id);
    }
  }
  function appendResponseText(delta) {
    if (!delta) return;
    responseText += delta;
    updateAgentCaption(responseText);
    syncLipsyncTimeline();
  }
  function addAudioChunkMs(pcm16) {
    responseAudioMs += pcm16.length / 24e3 * 1e3;
    syncLipsyncTimeline();
  }
  function sendFunctionOutput(callId, output) {
    ws.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output)
      }
    }));
  }
  function handleEndConversationTool(callId, argsJson) {
    if (replayingPrepMessages) return;
    if ((ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) {
      uiLog("end", "end_conversation tool ignored \u2014 ws not open", "warn", { ws: wsStateLabel() });
      return;
    }
    let reason = "user said goodbye";
    try {
      const args = JSON.parse(argsJson || "{}");
      if (args.reason) reason = args.reason;
    } catch (e) {
    }
    if (callId) sendFunctionOutput(callId, { success: true, reason });
    if (pendingEndConversation) {
      uiLog("end", "end_conversation tool duplicate (".concat(reason, ")"), "hello");
      return;
    }
    uiLog("end", "end_conversation tool (".concat(reason, ")"), "hello");
    pendingEndConversation = true;
    setStatus("Goodbye!");
    startByebyeAnimation();
    closeAfterToolEnd();
    setTimeout(closeAfterToolEnd, 1500);
    scheduleForceCloseAfterTool();
  }
  function handleFunctionCall(event) {
    if ((ws == null ? void 0 : ws.readyState) !== WebSocket.OPEN) return;
    const { name, call_id: callId, arguments: argsJson } = resolveFunctionCall(event);
    if (!name || !callId) {
      console.warn("Function call missing name or call_id", event);
      return;
    }
    if (handledFunctionCallIds.has(callId)) return;
    handledFunctionCallIds.add(callId);
    if (name === HAPPY) {
      let reason = "user asked to dance";
      try {
        const args = JSON.parse(argsJson || "{}");
        if (args.reason) reason = args.reason;
      } catch (e) {
      }
      const danceUrl = pickRandomDanceUrl();
      avatar == null ? void 0 : avatar.playMixamoAnimation(danceUrl);
      lastChickenDanceAt = Date.now();
      sendFunctionOutput(callId, { success: true, reason, animation: animationNameFromUrl(danceUrl) });
      ws.send(JSON.stringify({ type: "response.create" }));
      return;
    }
    if (name === KUNGFU) {
      let reason = "user asked to fight";
      try {
        const args = JSON.parse(argsJson || "{}");
        if (args.reason) reason = args.reason;
      } catch (e) {
      }
      const kungfuUrl = pickRandomKungfuUrl();
      avatar == null ? void 0 : avatar.playMixamoAnimation(kungfuUrl);
      lastKungfuAt = Date.now();
      sendFunctionOutput(callId, { success: true, reason, animation: animationNameFromUrl(kungfuUrl) });
      ws.send(JSON.stringify({ type: "response.create" }));
      return;
    }
    const gameToolMatch = {
      [PLAY_WORDWHACK]: "wordwhack",
      [PLAY_CARDGAME]: "cardgame",
      [PLAY_FINDGAME]: "findgame"
    }[name];
    if (gameToolMatch) {
      let reason = "user asked to play a game";
      try {
        const args = JSON.parse(argsJson || "{}");
        if (args.reason) reason = args.reason;
      } catch (e) {
      }
      const game = getGameById(gameToolMatch);
      if (!game) {
        sendFunctionOutput(callId, { success: false, error: "Unknown game: ".concat(gameToolMatch) });
        ws.send(JSON.stringify({ type: "response.create" }));
        return;
      }
      sendFunctionOutput(callId, {
        success: true,
        reason,
        game: game.id,
        game_name: game.name
      });
      ws.send(JSON.stringify({ type: "response.create" }));
      launchGame(reason, game);
      return;
    }
    if (name === END_CONVERSATION) {
      if (replayingPrepMessages) return;
      uiLog("end", "function_call end_conversation received", "hello", { callId });
      handleEndConversationTool(callId, argsJson);
    }
  }
  async function getConfig(forceRefresh = false) {
    if (cachedConfig && !forceRefresh) return cachedConfig;
    try {
      const configUrl = PREVIEW_MODE ? "/api/preview-config?preview=1" : "/api/config";
      const res = await fetch(configUrl);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.avatar) {
          localStorage.setItem(AVATAR_KEY, JSON.stringify(normalizeAvatar(cfg.avatar)));
        }
        if (cfg.lipsync) {
          localStorage.setItem(LIPSYNC_KEY, JSON.stringify(normalizeLipsync(cfg.lipsync)));
        }
        applyGameIconsFromConfig(cfg.gameIcons);
        videoPairsTimezone = cfg.videoPairsTimezone || "Asia/Hong_Kong";
        cachedConfig = cfg;
        return cfg;
      }
    } catch (e) {
    }
    cachedConfig = {
      apiKey: localStorage.getItem(KEY),
      instructions: localStorage.getItem(PROMPT_KEY),
      voice: localStorage.getItem(VOICE_KEY),
      model: localStorage.getItem(MODEL_KEY),
      avatar: loadAvatarFromLocalStorage(),
      lipsync: loadLipsyncFromLocalStorage()
    };
    return cachedConfig;
  }
  function releasePrepMic(prep) {
    var _a, _b, _c, _d, _e;
    if (!prep) return;
    try {
      (_a = prep.proc) == null ? void 0 : _a.disconnect();
    } catch (e) {
    }
    try {
      (_b = prep.source) == null ? void 0 : _b.disconnect();
    } catch (e) {
    }
    prep.proc = null;
    prep.source = null;
    try {
      (_c = prep.stream) == null ? void 0 : _c.getTracks().forEach((t) => t.stop());
    } catch (e) {
    }
    prep.stream = null;
    try {
      if (((_d = prep.ctx) == null ? void 0 : _d.state) !== "closed") (_e = prep.ctx) == null ? void 0 : _e.close();
    } catch (e) {
    }
    prep.ctx = null;
  }
  function abortConnectPrep() {
    var _a;
    if (!connectPrep) return;
    const prep = connectPrep;
    connectPrep = null;
    prep.aborted = true;
    prep.messageQueue = [];
    try {
      (_a = prep.ws) == null ? void 0 : _a.close();
    } catch (e) {
    }
    releasePrepMic(prep);
  }
  function waitForWsOpen(socket, timeoutMs = 12e3) {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      return Promise.reject(new Error("WebSocket closed before open"));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("close", () => {
        clearTimeout(timer);
        reject(new Error("WebSocket closed before open"));
      }, { once: true });
    });
  }
  function openSessionWebSocket(cfg, apiKey) {
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket("".concat(wsProtocol, "//").concat(location.host, "/ws"));
    return new Promise((resolve, reject) => {
      socket.onopen = () => {
        var _a, _b;
        uiLog("session", "ws open", "hello");
        socket.send(JSON.stringify({
          type: "client.auth",
          apiKey,
          instructions: getSessionInstructions(cfg),
          voice: ((_a = cfg.voice) == null ? void 0 : _a.trim()) || DEFAULT_VOICE,
          model: ((_b = cfg.model) == null ? void 0 : _b.trim()) || DEFAULT_MODEL
        }));
        resolve(socket);
      };
      socket.onerror = () => reject(new Error("WebSocket failed"));
      socket.onclose = () => reject(new Error("WebSocket closed"));
    });
  }
  function setupMicPipeline() {
    if ((ctx == null ? void 0 : ctx.state) === "suspended") ctx.resume().catch(() => {
    });
    source = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = ({ inputBuffer }) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const f = inputBuffer.getChannelData(0);
      const pcm = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, f[i] * 32768));
      ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64(pcm.buffer) }));
    };
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    source.connect(proc);
    proc.connect(silentGain);
    silentGain.connect(ctx.destination);
  }
  function handleWsMessage(data) {
    var _a, _b, _c;
    const e = JSON.parse(data);
    if (e.type === "client.error") {
      if (replayingPrepMessages) {
        uiLog("session", "client.error during prep replay (ignored): ".concat(e.message), "warn");
        return;
      }
      uiLog("session", "client.error: ".concat(e.message), "err");
      showErr(e.message);
      ws.close();
      return;
    }
    if (e.response_id) handleNewResponse(e.response_id);
    if (e.type === "response.created") {
      cancelIdleNudge();
      handleNewResponse(((_a = e.response) == null ? void 0 : _a.id) || e.response_id);
    }
    if (e.type === "response.output_text.delta" || e.type === "response.output_audio_transcript.delta") {
      appendResponseText(e.delta);
    }
    if (e.type === "response.output_text.done" || e.type === "response.output_audio_transcript.done") {
      if (e.text) responseText = e.text;
      else if (e.transcript) responseText = e.transcript;
      updateAgentCaption(responseText);
      syncLipsyncTimeline();
    }
    if (e.type === "response.output_audio.delta") {
      setStatus("Conversation active \u2014 speak anytime", true);
      const pcm16 = Uint8Array.from(atob(e.delta), (c) => c.charCodeAt(0));
      addAudioChunkMs(new Int16Array(pcm16.buffer));
      queue.push(pcm16.buffer);
      if (!playing) playNext();
    } else if (e.type === "response.output_item.added") {
      trackFunctionCallItem(e.item);
    } else if (e.type === "response.output_item.done") {
      trackFunctionCallItem(e.item);
      if (((_b = e.item) == null ? void 0 : _b.type) === "function_call") {
        handleFunctionCall({
          name: e.item.name,
          call_id: e.item.call_id || e.item.id,
          item_id: e.item.id,
          arguments: e.item.arguments || "{}"
        });
      }
    } else if (e.type === "conversation.item.input_audio_transcription.completed") {
      if ((_c = e.transcript) == null ? void 0 : _c.trim()) showUserHeard(e.transcript);
      if (isDanceRequest(e.transcript)) triggerChickenDance(e.transcript);
      if (isFightRequest(e.transcript)) triggerKungfu(e.transcript);
      if (isGoodbyeRequest(e.transcript)) triggerEndConversation(e.transcript);
    } else if (e.type === "session.updated" || e.type === "session.created") {
      setStatus("Conversation active \u2014 speak anytime", true);
      avatar == null ? void 0 : avatar.refreshAfterVisible();
    } else if (e.type === "input_audio_buffer.speech_started") {
      idleNudgeCount = 0;
      cancelIdleNudge();
      showUserListening();
      updateAgentCaption("");
      stopAudio();
      stopAvatarSpeech();
      resetResponseState(null);
    } else if (e.type === "input_audio_buffer.timeout_triggered") {
      setStatus("No speech detected \u2014 Uncle Tommy is checking in", true);
    } else if (e.type === "response.output_audio.done") {
      audioDone = true;
      maybeEndAvatarSpeech();
      closeAfterToolEnd();
      if (!replayingPrepMessages && !playing && queue.length === 0) scheduleIdleNudge();
    } else if (e.type === "response.done") {
      audioDone = true;
      maybeEndAvatarSpeech();
      closeAfterToolEnd();
      if (!replayingPrepMessages && !playing && queue.length === 0) scheduleIdleNudge();
    } else if (e.type === "response.function_call_arguments.done") {
      handleFunctionCall(e);
    }
  }
  function attachWsHandlers(socket) {
    socket.onmessage = ({ data }) => {
      try {
        handleWsMessage(data);
      } catch (err) {
        uiLog("session", "message handler: ".concat((err == null ? void 0 : err.message) || err), "err");
      }
    };
    socket.onclose = (event) => {
      uiLog("session", "ws closed", "hello", {
        code: event.code,
        reason: event.reason || "(none)",
        wasClean: event.wasClean
      });
      const shouldPlayByebye = pendingEndConversation;
      try {
        cleanupSession({ keepSessionView: shouldPlayByebye });
      } catch (e) {
        console.error("cleanupSession threw", e);
      } finally {
        if (shouldPlayByebye) finishByebyeAndReturnToHelloCycle();
        else returnToHelloCycle();
      }
    };
  }
  function beginConnectPrep() {
    if (active) return Promise.resolve(null);
    if (connectPrep == null ? void 0 : connectPrep.readyPromise) return connectPrep.readyPromise;
    const prep = {
      aborted: false,
      cfg: null,
      ctx: null,
      stream: null,
      ws: null,
      messageQueue: [],
      readyPromise: null
    };
    connectPrep = prep;
    prep.readyPromise = (async () => {
      var _a;
      const cfg = await getConfig();
      prep.cfg = cfg;
      const apiKey = (_a = cfg.apiKey) == null ? void 0 : _a.trim();
      if (!apiKey) throw new Error("NO_API_KEY");
      const micWork = (async () => {
        prep.ctx = new AudioContext({ sampleRate: 24e3 });
        prep.stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 24e3, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
      })();
      const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
      prep.ws = new WebSocket("".concat(wsProtocol, "//").concat(location.host, "/ws"));
      prep.ws.onopen = () => {
        var _a2, _b;
        if (prep.aborted) return;
        prep.ws.send(JSON.stringify({
          type: "client.auth",
          apiKey,
          instructions: getSessionInstructions(cfg),
          voice: ((_a2 = cfg.voice) == null ? void 0 : _a2.trim()) || DEFAULT_VOICE,
          model: ((_b = cfg.model) == null ? void 0 : _b.trim()) || DEFAULT_MODEL
        }));
      };
      prep.ws.onmessage = ({ data }) => {
        if (prep.aborted || active) return;
        prep.messageQueue.push(data);
      };
      prep.ws.onclose = () => {
        if (prep.aborted || active) return;
        prep.aborted = true;
      };
      await Promise.all([micWork, waitForWsOpen(prep.ws)]);
      if (prep.aborted) throw new Error("Connection prep aborted");
      return prep;
    })().catch((e) => {
      if (!prep.aborted) abortConnectPrep();
      throw e;
    });
    return prep.readyPromise;
  }
  function clearRecognitionWatchdog() {
    if (recognitionWatchdog) {
      clearTimeout(recognitionWatchdog);
      recognitionWatchdog = null;
    }
  }
  function armRecognitionWatchdog() {
    clearRecognitionWatchdog();
    recognitionWatchdog = setTimeout(() => {
      recognitionWatchdog = null;
      if (!listeningForWakeWord || !wakeWordEnabled || active) return;
      uiLog("hello", "watchdog: no speech activity, restarting recognition", "warn");
      stopWakeWordListening();
      scheduleWakeWordRestart("watchdog");
    }, RECOGNITION_WATCHDOG_MS);
  }
  function stopWakeWordListening() {
    uiLog("hello", "stopWakeWordListening", "hello");
    listeningForWakeWord = false;
    clearRecognitionWatchdog();
    if (wakeWordRestartTimer) {
      clearTimeout(wakeWordRestartTimer);
      wakeWordRestartTimer = null;
    }
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch (e) {
      }
      try {
        recognition.abort();
      } catch (e) {
        uiLog("hello", "recognition.abort failed", "warn", { message: e == null ? void 0 : e.message });
      }
    }
    recognition = null;
  }
  function resumeWakeWordListening() {
    returnToHelloCycle();
  }
  function containsWakeWord(text) {
    return text.toLowerCase().split(/\s+/).some((word) => word.replace(/[^\w]/g, "") === WAKE_WORD);
  }
  function startWakeWordListening() {
    if (!SpeechRecognition) {
      uiLog("hello", "SpeechRecognition unsupported", "err");
      showErr("Speech recognition is not supported in this browser. Use the Start button instead.");
      setStatus("Tap Start to begin a conversation");
      return;
    }
    if (active || listeningForWakeWord || !wakeWordEnabled) {
      uiLog("hello", "startWakeWordListening skipped", "warn", snapshotHelloCycleState());
      return;
    }
    uiLog("hello", "startWakeWordListening", "hello");
    recognition = new SpeechRecognition();
    recognition.continuous = !IS_IOS;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      uiLog("hello", "recognition.onstart \u2014 mic active for wake word", "hello");
      armRecognitionWatchdog();
    };
    recognition.onresult = (event) => {
      armRecognitionWatchdog();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        uiLog("hello", 'heard "'.concat(transcript.trim(), '"').concat(isFinal ? " (final)" : ""), "hello");
        if (containsWakeWord(transcript)) {
          uiLog("hello", "wake word matched \u2192 connectConversation", "hello");
          wakeWordEnabled = false;
          wakeWordRestartAttempts = 0;
          stopWakeWordListening();
          setStatus("Wake word detected \u2014 connecting\u2026");
          connectConversation();
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      listeningForWakeWord = false;
      uiLog("hello", "recognition error: ".concat(event.error), event.error === "not-allowed" ? "err" : "warn");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showErr("Microphone access denied for speech recognition. Tap Start to begin.");
        setStatus("Tap Start to begin a conversation");
        return;
      }
      scheduleWakeWordRestart("error:".concat(event.error));
    };
    recognition.onend = () => {
      listeningForWakeWord = false;
      uiLog("hello", "recognition ended", "hello", snapshotHelloCycleState());
      if (wakeWordEnabled && !active) scheduleWakeWordRestart("onend");
    };
    try {
      recognition.start();
      listeningForWakeWord = true;
      wakeWordRestartAttempts = 0;
      setStatus('Listening for "Hello"\u2026');
      showErr("");
      uiLog("hello", "recognition.start OK", "hello");
      armRecognitionWatchdog();
    } catch (e) {
      uiLog("hello", "recognition.start threw", "err", { message: e == null ? void 0 : e.message });
      scheduleWakeWordRestart("start-threw");
    }
  }
  function scheduleWakeWordRestart(reason = "unknown") {
    if (!wakeWordEnabled || active) {
      uiLog("hello", "scheduleWakeWordRestart skipped (".concat(reason, ")"), "warn", snapshotHelloCycleState());
      return;
    }
    if (wakeWordRestartTimer) clearTimeout(wakeWordRestartTimer);
    wakeWordRestartAttempts = Math.min(wakeWordRestartAttempts + 1, 6);
    const base = WAKE_WORD_RESTART_DELAY;
    const delay = base * Math.pow(1.6, wakeWordRestartAttempts - 1);
    uiLog("hello", "schedule restart in ".concat(Math.round(delay), "ms (").concat(reason, ")"), "hello", {
      attempt: wakeWordRestartAttempts
    });
    if (IS_IOS && wakeWordRestartAttempts >= 4) {
      setStatus('Tap "Start" or say "Hello" to begin');
    }
    wakeWordRestartTimer = setTimeout(() => {
      wakeWordRestartTimer = null;
      uiLog("hello", "backoff timer fired (".concat(reason, ")"), "hello", snapshotHelloCycleState());
      if (wakeWordEnabled && !active) startWakeWordListening();
      else uiLog("hello", "backoff timer skipped", "warn", snapshotHelloCycleState());
    }, delay);
  }
  async function connectConversation({ preparedView = false } = {}) {
    var _a, _b, _c;
    if (active) {
      uiLog("session", "connectConversation skipped \u2014 already active", "warn");
      return;
    }
    uiLog("session", "connectConversation begin", "hello");
    const cfg = cachedConfig || await getConfig();
    const apiKey = (_a = cfg.apiKey) == null ? void 0 : _a.trim();
    if (!apiKey) {
      uiLog("session", "no API key", "err");
      sfx == null ? void 0 : sfx.play("loginFail", { interrupt: true });
      showErr("No API key set.");
      abortConnectPrep();
      if (preparedView) abortPreparedConversationView();
      resumeWakeWordListening();
      return;
    }
    showErr("");
    btnStart.disabled = true;
    btnStart.textContent = "Connecting\u2026";
    setStatus("Connecting to Uncle Tommy\u2026");
    pendingEndConversation = false;
    pendingFunctionCalls.clear();
    handledFunctionCallIds.clear();
    idleNudgeCount = 0;
    cancelIdleNudge();
    if (endConversationCloseTimer) {
      clearTimeout(endConversationCloseTimer);
      endConversationCloseTimer = null;
    }
    byebyeAnimationPromise = null;
    let prep = connectPrep;
    connectPrep = null;
    const queuedMessages = [];
    try {
      if (prep) {
        try {
          await prep.readyPromise;
        } catch (e) {
          uiLog("session", "connect prep wait: ".concat((e == null ? void 0 : e.message) || e), "warn");
        }
        if (!prep.aborted && prep.stream && prep.ctx) {
          ctx = prep.ctx;
          stream = prep.stream;
        }
        if (!prep.aborted && ((_b = prep.ws) == null ? void 0 : _b.readyState) === WebSocket.OPEN) {
          ws = prep.ws;
          queuedMessages.push(...prep.messageQueue);
        } else {
          try {
            (_c = prep.ws) == null ? void 0 : _c.close();
          } catch (e) {
          }
        }
        prep.ctx = null;
        prep.stream = null;
        prep.ws = null;
        prep.messageQueue = [];
      }
      if (!stream || !ctx) {
        ctx = new AudioContext({ sampleRate: 24e3 });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 24e3, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        ws = await openSessionWebSocket(cfg, apiKey);
      }
    } catch (e) {
      const denied = (e == null ? void 0 : e.name) === "NotAllowedError" || (e == null ? void 0 : e.name) === "NotFoundError";
      uiLog("session", denied ? "getUserMedia denied" : "connect failed: ".concat(e == null ? void 0 : e.message), "err");
      sfx == null ? void 0 : sfx.play("loginFail", { interrupt: true });
      showErr(denied ? "Microphone access denied." : "Could not connect. Try again.");
      try {
        ws == null ? void 0 : ws.close();
      } catch (e2) {
      }
      ws = null;
      abortConnectPrep();
      releaseMicSync();
      btnStart.textContent = "Start Conversation";
      btnStart.disabled = false;
      if (preparedView) abortPreparedConversationView();
      resumeWakeWordListening();
      return;
    }
    resetResponseState(null);
    clearConversationCaptions();
    attachWsHandlers(ws);
    active = true;
    setupMicPipeline();
    sfx == null ? void 0 : sfx.play("loginSuccess", { interrupt: true });
    uiLog("session", "session live", "hello", { prep: Boolean(prep), queued: queuedMessages.length });
    if (queuedMessages.length) {
      replayingPrepMessages = true;
      try {
        for (const data of queuedMessages) {
          try {
            handleWsMessage(data);
          } catch (err) {
            uiLog("session", "replay message: ".concat((err == null ? void 0 : err.message) || err), "warn");
          }
        }
      } finally {
        replayingPrepMessages = false;
      }
    }
    if (!preparedView && !inSession) {
      await enterSessionView();
    }
  }
  function endConversation() {
    uiLog("end", "End Conversation button", "hello", snapshotHelloCycleState());
    if (!active) {
      uiLog("end", "End Conversation ignored \u2014 not active", "warn");
      return;
    }
    ws.close();
  }
  function playNext() {
    if (!queue.length) {
      playing = false;
      maybeEndAvatarSpeech();
      closeAfterToolEnd();
      if (audioDone) scheduleIdleNudge();
      return;
    }
    playing = true;
    beginAvatarSpeech();
    const pcm16 = new Int16Array(queue.shift());
    const len = pcm16.length;
    const fade = 48;
    const f32 = new Float32Array(len);
    for (let i = 0; i < len; i++) f32[i] = pcm16[i] / 32768;
    for (let i = 0; i < fade; i++) {
      f32[i] *= i / fade;
      f32[len - 1 - i] *= i / fade;
    }
    const buf = ctx.createBuffer(1, len, 24e3);
    buf.getChannelData(0).set(f32);
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime, nextPlayTime);
    if (!speechPlaybackStart) speechPlaybackStart = t;
    nextPlayTime = t + buf.duration;
    src.onended = playNext;
    src.start(t);
  }
  function stopAudio() {
    queue.length = 0;
    playing = false;
    nextPlayTime = 0;
    try {
      src == null ? void 0 : src.stop();
    } catch (e) {
    }
    src = null;
  }
  function b64(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  btnStart.addEventListener("click", async () => {
    uiLog("hello", "Start button clicked", "hello");
    wakeWordEnabled = false;
    wakeWordRestartAttempts = 0;
    stopWakeWordListening();
    beginConnectPrep().catch(() => {
    });
    await Promise.all([
      enterSessionView(),
      connectConversation({ preparedView: true })
    ]);
  });
  btnStop.addEventListener("click", () => {
    sfx == null ? void 0 : sfx.play("back");
    endConversation();
  });
  btnSendLog.addEventListener("click", sendDebugLogToServer);
  window.addEventListener("resize", () => {
    if (inSession) avatar == null ? void 0 : avatar.refreshAfterVisible();
    fitHkoWeatherLocation();
    fitHkoWeatherDateTime();
    fitHkoWeatherRow();
  });
  if (IS_IOS && !PREVIEW_MODE) {
    const unlock = () => {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ac.createOscillator();
        const g = ac.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 1e-3);
        ac.resume().then(() => ac.close()).catch(() => {
        });
      } catch (e) {
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
  }
  async function init() {
    const fromGame = shouldAutoConnectFromGame();
    setSplashProgress(5);
    const cfg = await getConfig();
    setSplashProgress(10);
    if (fromGame) {
      dismissSplash();
      dismissIdleVideoScreen();
      setIdleVideoMode(false);
      setVideosLoading(false);
      preloadMediaAssets(cfg).catch((e) => console.warn("background preload:", e));
      initDailyRewards({ autoShow: false });
      try {
        await autoConnectFromGameReturn();
      } catch (e) {
        console.error(e);
        showErr("Failed to connect: ".concat(e.message));
        setStatus('Tap "Start" to begin a conversation');
      }
      return;
    }
    try {
      const idleVideoReady = await preloadMediaAssets(cfg);
      dismissSplash();
      if (idleVideoReady) {
        startIdleVideoPlayback();
        setStatus("Tap the screen to begin a conversation");
      } else if (ENABLE_WAKE_WORD) {
        startWakeWordListening();
      } else {
        setStatus('Tap "Start" to begin a conversation');
      }
      initDailyRewards({ autoShow: false });
    } catch (e) {
      console.error(e);
      dismissSplash();
      showErr("Failed to load: ".concat(e.message));
      setStatus('Tap "Start" to begin a conversation');
    }
  }
  var PREVIEW_GAMES = /* @__PURE__ */ new Map([
    ["game-wordchop", {
      name: "Word Chop",
      url: "/vocab-game/index.html?preview=1&embedded=1"
    }],
    ["game-wordwhack", {
      name: "Word-Whack Blitz",
      url: "/games/?preview=1&embedded=1"
    }],
    ["game-cardgame", {
      name: "Picture-Word Memory Match",
      url: "/games/CardGame/?preview=1&embedded=1"
    }],
    ["game-findgame", {
      name: "Find the Object",
      url: "/games/FindGame/?preview=1&embedded=1"
    }]
  ]);
  var PREVIEW_SCREENS = /* @__PURE__ */ new Set([
    "home",
    "start",
    "loop",
    "transition",
    "conversation",
    "rewards",
    "collection-locked",
    "collection-unlocked",
    "map",
    "game",
    ...PREVIEW_GAMES.keys()
  ]);
  function setPreviewVideo(videoEl, shouldPlay) {
    videoEl.pause();
    videoEl.muted = true;
    videoEl.volume = 0;
    videoEl.loop = shouldPlay;
    if (!shouldPlay || !videoEl.currentSrc) return;
    videoEl.currentTime = 0;
    videoEl.play().catch(() => {
    });
  }
  function resetPreviewSurface() {
    var _a, _b;
    document.body.classList.remove(
      "in-session",
      "has-idle-video",
      "idle-video-dismissed",
      "playing-transition-video",
      "videos-loading",
      "rewards-enabled",
      ...Array.from(PREVIEW_SCREENS, (screen2) => "preview-screen-".concat(screen2))
    );
    inSession = false;
    playingTransitionVideo = false;
    setPreviewVideo(idleVideoEl, false);
    setPreviewVideo(transitionVideoEl, false);
    hideDailyRewardsOverlay();
    (_b = (_a = window.LangoCollection) == null ? void 0 : _a.close) == null ? void 0 : _b.call(_a);
    gameLaunchOverlay.classList.remove("visible");
    gameLaunchOverlay.setAttribute("aria-hidden", "true");
    captionUserEl.hidden = true;
    captionAgentEl.hidden = true;
  }
  async function showPreviewScreen(requestedScreen) {
    var _a, _b;
    const screen2 = PREVIEW_SCREENS.has(requestedScreen) ? requestedScreen : "home";
    resetPreviewSurface();
    document.body.classList.add("preview-screen-".concat(screen2));
    previewScreenSelect.value = screen2;
    const url = new URL(location.href);
    url.searchParams.set("preview", "1");
    if (screen2 === "home") url.searchParams.delete("screen");
    else url.searchParams.set("screen", screen2);
    history.replaceState(null, "", "".concat(url.pathname).concat(url.search).concat(url.hash));
    if (screen2 === "start") {
      setStatus('Tap "Start" to begin a conversation');
      return;
    }
    if (screen2 === "loop" || screen2 === "home" || screen2 === "rewards") {
      if (idleVideoUrl) {
        setIdleVideoMode(true);
        restoreIdleVideoScreen();
        setPreviewVideo(idleVideoEl, true);
      }
    }
    if (screen2 === "transition") {
      if (transitionVideoUrl) {
        setIdleVideoMode(true);
        restoreIdleVideoScreen();
        setTransitionVideoMode(true);
        setPreviewVideo(transitionVideoEl, true);
      } else {
        setStatus("No transition video configured");
      }
      return;
    }
    if (screen2 === "conversation") {
      document.body.classList.add("in-session");
      inSession = true;
      setStatus("Conversation preview \u2014 microphone and socket disabled", true);
      captionUserTextEl.textContent = "Hello, Uncle Tommy!";
      captionAgentTextEl.textContent = "Hello! What would you like to learn today?";
      captionUserEl.hidden = false;
      captionAgentEl.hidden = false;
      try {
        await ensureAvatar();
        avatar == null ? void 0 : avatar.refreshAfterVisible();
      } catch (e) {
        showErr("Avatar preview unavailable: ".concat(e.message));
      }
      return;
    }
    if (screen2 === "rewards") {
      previewClaimedMilestones = [];
      renderDailyRewards(previewRewardStatus());
      showDailyRewardsOverlay();
      return;
    }
    if (screen2 === "collection-locked" || screen2 === "collection-unlocked") {
      await ((_b = (_a = window.LangoCollection) == null ? void 0 : _a.open) == null ? void 0 : _b.call(_a, { unlocked: screen2 === "collection-unlocked" }));
      return;
    }
    if (screen2 === "map") {
      return;
    }
    const previewGame = PREVIEW_GAMES.get(screen2);
    if (previewGame) {
      if (gamePreviewFrame.dataset.previewScreen !== screen2) {
        gamePreviewFrame.src = previewGame.url;
        gamePreviewFrame.dataset.previewScreen = screen2;
      }
      gamePreviewFrame.title = "".concat(previewGame.name, " preview");
      return;
    }
    if (screen2 === "game") {
      const game = GAME_CATALOG[0];
      gameLaunchCard.className = "game-launch-card theme-".concat(game.theme);
      gameLaunchHeading.textContent = "Great choice!";
      gameLaunchName.textContent = game.name;
      gameLaunchSub.textContent = game.sub;
      gameLaunchIcon.src = game.icon;
      gameLaunchIcon.alt = game.name;
      gameLaunchReel.className = "game-launch-reel landed";
      setGameLaunchProgress(72);
      gameLaunchOverlay.classList.add("visible");
      gameLaunchOverlay.setAttribute("aria-hidden", "false");
    }
  }
  async function initPreviewMode() {
    document.body.classList.add("preview-mode");
    wakeWordEnabled = false;
    dismissSplash();
    setVideosLoading(false);
    renderHkoWeather({
      condition: "Cloudy",
      temperature: 28,
      temperatureUnit: "C",
      humidity: 82,
      humidityUnit: "%"
    });
    const cfg = await getConfig();
    applyGameIconsFromConfig(cfg.gameIcons);
    applyActivePairBackground(cfg);
    try {
      await Promise.race([
        setupIdleVideosFromConfig(cfg, { autoplay: false }),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch (e) {
      console.warn("Preview video setup:", e);
    }
    const initialScreen = new URLSearchParams(location.search).get("screen") || "home";
    await showPreviewScreen(initialScreen);
  }
  previewScreenSelect.addEventListener("change", () => {
    showPreviewScreen(previewScreenSelect.value).catch((e) => {
      console.error("Preview screen:", e);
    });
  });
  previewExit.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("preview");
    url.searchParams.delete("screen");
    const destination = "".concat(url.pathname).concat(url.search).concat(url.hash) || "/";
    if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
      window.LangoPageTransition.navigate(destination);
    } else {
      location.assign(destination);
    }
  });
  function setPreviewToolbarCollapsed(collapsed) {
    document.documentElement.classList.toggle("preview-toolbar-collapsed", collapsed);
    if (previewToolbarShow) previewToolbarShow.hidden = !collapsed;
    try {
      sessionStorage.setItem(PREVIEW_TOOLBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch (e) {
    }
  }
  previewToolbarHide == null ? void 0 : previewToolbarHide.addEventListener("click", () => setPreviewToolbarCollapsed(true));
  previewToolbarShow == null ? void 0 : previewToolbarShow.addEventListener("click", () => setPreviewToolbarCollapsed(false));
  if (PREVIEW_MODE) {
    try {
      if (sessionStorage.getItem(PREVIEW_TOOLBAR_COLLAPSED_KEY) === "1") {
        setPreviewToolbarCollapsed(true);
      }
    } catch (e) {
    }
  }
  if (!PREVIEW_MODE && ENABLE_WAKE_WORD) {
    setInterval(() => {
      if (wakeWordEnabled && !active && !listeningForWakeWord && !wakeWordRestartTimer) {
        uiLog("hello", "safety net restart (idle but not listening)", "warn", snapshotHelloCycleState());
        wakeWordRestartAttempts = 0;
        startWakeWordListening();
      }
    }, 4e3);
  }
  if (PREVIEW_MODE) {
    uiLog("preview", "host layout preview init", "hello");
    initPreviewMode().catch((e) => {
      console.error(e);
      dismissSplash();
      showErr("Preview failed: ".concat(e.message));
    });
  } else {
    setInterval(() => {
      refreshIdleVideosForCurrentPeriod().catch(() => {
      });
    }, 18e4);
    uiLog("hello", "app init", "hello", { IS_IOS, WAKE_WORD_RESTART_DELAY, POST_SESSION_WAKE_DELAY });
    initVideoSoundUnlock();
    updateHkoDateTime();
    setInterval(updateHkoDateTime, 1e3);
    loadHkoWeather();
    setInterval(() => {
      loadHkoWeather().catch(() => {
      });
    }, 10 * 60 * 1e3);
    init();
  }
})();
