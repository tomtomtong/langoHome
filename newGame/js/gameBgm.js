/* ===========================================================
   Shared procedural background music
   Three lightweight themes, generated with the Web Audio API.
   =========================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "lango-game-bgm-muted";
  const LEGACY_COMBINED_KEY = "lango-game-sfx-muted";
  const LOOKAHEAD_SECONDS = 0.75;
  const SCHEDULER_INTERVAL_MS = 140;

  const THEMES = Object.freeze({
    wordwhack: {
      bpm: 116,
      wave: "triangle",
      melody: [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 83, 81, 79, 76, 74],
      bass: [48, null, null, null, 50, null, null, null, 53, null, null, null, 55, null, 53, null],
      sparkle: 84,
    },
    cardgame: {
      bpm: 94,
      wave: "sine",
      melody: [67, 71, 74, 79, 74, 71, 69, 72, 76, 81, 76, 72, 67, 71, 76, 74],
      bass: [43, null, null, null, 48, null, null, null, 45, null, null, null, 50, null, null, null],
      sparkle: 86,
    },
    findgame: {
      bpm: 104,
      wave: "triangle",
      melody: [64, 67, 69, 72, 69, 67, 62, 66, 69, 74, 72, 69, 64, 67, 71, 69],
      bass: [40, null, null, null, 45, null, null, null, 43, null, null, null, 47, null, null, null],
      sparkle: 81,
    },
  });

  let context = null;
  let master = null;
  let schedulerId = null;
  let desiredTheme = null;
  let currentTheme = null;
  let nextNoteTime = 0;
  let step = 0;
  let activated = false;
  let pausedByGame = true;
  let playing = false;
  let muted = false;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    muted = stored == null
      ? localStorage.getItem(LEGACY_COMBINED_KEY) === "1"
      : stored === "1";
  } catch {
    muted = false;
  }

  function setDomState(state) {
    document.documentElement.dataset.bgmState = state;
    if (desiredTheme) document.documentElement.dataset.bgmTheme = desiredTheme;
    else delete document.documentElement.dataset.bgmTheme;
  }

  function ensureContext() {
    if (context) {
      if (context.state === "suspended") context.resume();
      return context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setDomState("unsupported");
      return null;
    }
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);
    return context;
  }

  function noteFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function scheduleTone(midi, startsAt, duration, volume, wave) {
    if (!context || !master || midi == null) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const attack = Math.min(0.035, duration * 0.18);
    const releaseAt = Math.max(startsAt + attack, startsAt + duration - 0.07);

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(noteFrequency(midi), startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + attack);
    gain.gain.setValueAtTime(volume, releaseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  function scheduleStep(theme, startsAt) {
    const beat = 60 / theme.bpm;
    const eighth = beat / 2;
    const melodyNote = theme.melody[step % theme.melody.length];
    const bassNote = theme.bass[step % theme.bass.length];

    scheduleTone(melodyNote, startsAt, eighth * 0.84, 0.085, theme.wave);
    if (bassNote != null) {
      scheduleTone(bassNote, startsAt, eighth * 1.78, 0.052, "sine");
    }
    if (step % 8 === 6) {
      scheduleTone(theme.sparkle, startsAt + eighth * 0.25, eighth * 0.58, 0.028, "sine");
    }

    step += 1;
    nextNoteTime += eighth;
  }

  function fillSchedule() {
    if (!playing || !context || !currentTheme) return;
    while (nextNoteTime < context.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStep(currentTheme, nextNoteTime);
    }
  }

  function haltScheduler(state = "paused") {
    if (schedulerId != null) {
      clearInterval(schedulerId);
      schedulerId = null;
    }
    playing = false;
    if (context && master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.08);
    }
    setDomState(state);
  }

  function startIfReady() {
    if (!activated || muted || pausedByGame || !desiredTheme || document.hidden) return;
    const theme = THEMES[desiredTheme];
    const ctx = ensureContext();
    if (!theme || !ctx || !master) return;

    if (playing && currentTheme === theme) return;
    haltScheduler("starting");
    currentTheme = theme;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.06;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.26, ctx.currentTime, 0.16);
    playing = true;
    fillSchedule();
    schedulerId = window.setInterval(fillSchedule, SCHEDULER_INTERVAL_MS);
    setDomState("playing");
  }

  function unlock() {
    activated = true;
    ensureContext();
  }

  function play(themeName) {
    if (!THEMES[themeName]) return false;
    desiredTheme = themeName;
    pausedByGame = false;
    setDomState(muted ? "muted" : activated ? "starting" : "waiting-for-tap");
    startIfReady();
    return true;
  }

  function pause() {
    pausedByGame = true;
    haltScheduler("paused");
  }

  function stop() {
    pausedByGame = true;
    desiredTheme = null;
    currentTheme = null;
    haltScheduler("stopped");
  }

  function setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* Storage may be unavailable in embedded browsers. */
    }
    if (muted) haltScheduler("muted");
    else startIfReady();
    return muted;
  }

  function onFirstPointer() {
    unlock();
    window.setTimeout(startIfReady, 0);
  }

  document.addEventListener("pointerdown", onFirstPointer, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) haltScheduler("hidden");
    else if (!pausedByGame) startIfReady();
  });

  window.GameBgm = Object.freeze({
    play,
    pause,
    stop,
    unlock,
    setMuted,
    isMuted: () => muted,
    isPlaying: () => playing,
  });

  setDomState(muted ? "muted" : "idle");
})();
