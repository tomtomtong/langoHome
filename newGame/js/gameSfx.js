/* ===========================================================
   Shared game sound effects
   Uses the short CC0 clips documented in CardGame/assets/audio.
   =========================================================== */

(() => {
  "use strict";

  const scriptUrl = document.currentScript?.src || location.href;
  const audioBase = new URL("../CardGame/assets/audio/", scriptUrl);
  const STORAGE_KEY = "lango-game-sfx-muted";
  const LEGACY_STORAGE_KEY = "cardgame-muted";

  const files = {
    tap: "card-flip.wav",
    flip: "card-flip.wav",
    correct: "match.ogg",
    match: "match.ogg",
    wrong: "mismatch.ogg",
    mismatch: "mismatch.ogg",
    star: "star.ogg",
    reveal: "star.ogg",
    clear: "board-clear.ogg",
    finish: "board-clear.ogg",
    warning: "warning-tick.ogg",
    ready: "ready-shuffle.wav",
    gameover: "game-over.ogg",
  };

  const volumes = {
    tap: 0.32,
    flip: 0.4,
    correct: 0.46,
    match: 0.46,
    wrong: 0.34,
    mismatch: 0.34,
    star: 0.44,
    reveal: 0.36,
    clear: 0.48,
    finish: 0.48,
    warning: 0.2,
    ready: 0.3,
    gameover: 0.34,
  };

  const recorded = new Map();
  let context = null;
  let master = null;
  let activated = false;
  let initialized = false;
  let muted = false;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    muted = stored == null
      ? localStorage.getItem(LEGACY_STORAGE_KEY) === "1"
      : stored === "1";
  } catch {
    muted = false;
  }

  function ensureContext() {
    if (context) {
      if (context.state === "suspended") context.resume();
      return context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);
    return context;
  }

  function tone(frequency, duration, options = {}) {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx || !master) return;
    const start = ctx.currentTime + (options.delay || 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        options.endFrequency,
        start + duration
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.3, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playSynth(name) {
    if (name === "tap" || name === "flip") {
      tone(360, 0.07, { endFrequency: 620, type: "triangle", volume: 0.2 });
    } else if (name === "correct" || name === "match") {
      tone(523.25, 0.15, { type: "sine", volume: 0.3 });
      tone(659.25, 0.17, { delay: 0.07, type: "sine", volume: 0.28 });
      tone(783.99, 0.2, { delay: 0.14, type: "sine", volume: 0.26 });
    } else if (name === "wrong" || name === "mismatch") {
      tone(205, 0.14, { endFrequency: 155, type: "triangle", volume: 0.16 });
      tone(150, 0.16, { delay: 0.08, endFrequency: 118, type: "triangle", volume: 0.14 });
    } else if (name === "star" || name === "reveal") {
      tone(330, 0.12, { endFrequency: 660, type: "triangle", volume: 0.11 });
      [783.99, 1046.5, 1318.51, 1567.98].forEach((frequency, index) => {
        tone(frequency, 0.3, { delay: 0.025 + index * 0.055, type: "sine", volume: 0.14 });
      });
    } else if (name === "clear" || name === "finish") {
      [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
        tone(frequency, 0.28, { delay: index * 0.08, type: "triangle", volume: 0.22 });
      });
    } else if (name === "warning") {
      tone(760, 0.055, { type: "square", volume: 0.08 });
    } else if (name === "ready") {
      tone(440, 0.11, { type: "sine", volume: 0.16 });
      tone(659.25, 0.18, { delay: 0.09, type: "sine", volume: 0.18 });
    } else if (name === "gameover") {
      tone(392, 0.22, { endFrequency: 330, type: "triangle", volume: 0.18 });
      tone(293.66, 0.3, { delay: 0.16, endFrequency: 220, type: "triangle", volume: 0.16 });
    }
  }

  function preload() {
    if (typeof Audio === "undefined") return;
    Object.entries(files).forEach(([name, filename]) => {
      const audio = new Audio(new URL(filename, audioBase).href);
      audio.preload = "auto";
      recorded.set(name, audio);
    });
  }

  function play(name, options = {}) {
    if (muted || !activated) return;
    const hasLayeredCelebration = name === "star";
    if (hasLayeredCelebration) playSynth(name);
    const template = recorded.get(name);
    if (!template) {
      if (!hasLayeredCelebration) playSynth(name);
      return;
    }
    const audio = template.cloneNode(true);
    audio.volume = Math.max(0, Math.min(1, options.volume ?? volumes[name] ?? 0.4));
    if (options.rate) audio.playbackRate = Math.max(0.75, Math.min(1.4, options.rate));
    const playback = audio.play();
    if (playback?.catch) playback.catch(() => {
      if (!hasLayeredCelebration) playSynth(name);
    });
  }

  function unlock() {
    activated = true;
    ensureContext();
  }

  function syncButton(button) {
    if (!button) return;
    button.textContent = muted ? "🔇" : "🔊";
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Turn sound effects on" : "Mute sound effects");
    button.title = muted ? "Turn sound effects on" : "Mute sound effects";
  }

  function syncButtons() {
    document.querySelectorAll("[data-game-sfx-toggle]").forEach(syncButton);
  }

  function setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
      localStorage.setItem(LEGACY_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* Storage may be unavailable in embedded browsers. */
    }
    syncButtons();
    if (!muted) {
      unlock();
      play("ready");
    }
    return muted;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    preload();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.querySelectorAll("[data-game-sfx-toggle]").forEach((button) => {
      syncButton(button);
      button.addEventListener("click", () => setMuted(!muted));
    });
  }

  const api = Object.freeze({
    init,
    play,
    preload,
    unlock,
    setMuted,
    isMuted: () => muted,
    toggle: () => setMuted(!muted),
  });

  window.GameSfx = api;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
