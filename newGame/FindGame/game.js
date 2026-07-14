/* ===========================================================
   Find the Object — tap the object described in the sentence
   =========================================================== */

(() => {
  "use strict";

  const POINTS_PER_LEVEL = 100;
  const ROUND_TIME = 90;
  const MAX_WRONG_ATTEMPTS = 2;
  const ANSWER_REVEAL_MS = 10000;
  const SHOW_DEBUG_HINTS = new URLSearchParams(location.search).has("hints");

  let levels = [];
  let currentIndex = 0;
  let score = 0;
  let foundCount = 0;
  let wrongAttempts = 0;
  let timeLeft = ROUND_TIME;
  let timerId = null;
  let gameOver = false;
  let locked = false;
  let questionAudio = null;
  let questionAudioUrl = null;
  let speakRequestId = 0;
  let audioUnlocked = false;

  const sentenceEl = document.getElementById("sentence");
  const questionVoiceEl = document.getElementById("questionVoice");
  const voiceStatusEl = document.getElementById("voiceStatus");
  const foundValEl = document.getElementById("foundVal");
  const timerValEl = document.getElementById("timerVal");
  const timerWrapEl = document.getElementById("timerWrap");
  const scoreValEl = document.getElementById("scoreVal");
  const sceneWrap = document.getElementById("sceneWrap");
  const sceneImg = document.getElementById("sceneImg");
  const hotspotHints = document.getElementById("hotspotHints");
  const clickFx = document.getElementById("clickFx");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const overlayBtn = document.getElementById("overlayBtn");
  const replayBtn = document.getElementById("replayBtn");

  const DESIGN_W = 960;
  const DESIGN_H = 720;

  function fitGameToScreen() {
    const gameEl = document.getElementById("game");
    if (!gameEl) return;
    const vv = window.visualViewport;
    const pad = 8;
    const winW = (vv ? vv.width : window.innerWidth) - pad;
    const winH = (vv ? vv.height : window.innerHeight) - pad;
    const scale = Math.min(winW / DESIGN_W, winH / DESIGN_H, 4);
    gameEl.style.transform = `scale(${scale})`;
    gameEl.style.transformOrigin = "center center";
  }

  fitGameToScreen();
  window.addEventListener("resize", fitGameToScreen);
  window.addEventListener("orientationchange", fitGameToScreen);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitGameToScreen);
    window.visualViewport.addEventListener("scroll", fitGameToScreen);
  }

  function levelHotspots(lv) {
    if (Array.isArray(lv?.hotspots) && lv.hotspots.length) return lv.hotspots;
    if (lv?.hotspot) return [lv.hotspot];
    return [];
  }

  function levelSceneUrl(lv) {
    if (lv?.sceneUrl) return lv.sceneUrl;
    if (typeof FindImageConfig !== "undefined" && FindImageConfig.isCustomized("find_scene")) {
      return FindImageConfig.getUrl("find_scene");
    }
    return null;
  }

  function applyLevelScene(lv) {
    const url = levelSceneUrl(lv);
    if (url) {
      sceneImg.src = url;
    } else {
      sceneImg.removeAttribute("src");
    }
    sceneImg.style.transform = "";
    sceneImg.style.transformOrigin = "";
  }

  async function loadLevels() {
    levels = [];
    try {
      const res = await fetch("/api/findgame/levels");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.levels) || !data.levels.length) return;
      levels = data.levels.map((lv) => ({
        ...lv,
        hotspots: levelHotspots(lv),
      }));
    } catch {
      /* leave levels empty */
    }
  }

  function currentLevel() {
    return levels[currentIndex];
  }

  function pickRandomLevelIndex(excludeIndex = -1) {
    if (!levels.length) return 0;
    if (levels.length === 1) return 0;
    let next = excludeIndex;
    while (next === excludeIndex) {
      next = Math.floor(Math.random() * levels.length);
    }
    return next;
  }

  function stopTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTimerDisplay() {
    timerValEl.textContent = String(timeLeft);
    timerWrapEl.classList.toggle("timer-low", timeLeft <= 10);
  }

  function tickTimer() {
    if (gameOver) return;
    timeLeft -= 1;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      showGameOver();
    }
  }

  function startTimer() {
    stopTimer();
    timeLeft = ROUND_TIME;
    updateTimerDisplay();
    timerId = setInterval(tickTimer, 1000);
  }

  function renderPositionMarkers(hotspots) {
    hotspotHints.innerHTML = "";
    if (!hotspots.length || locked) {
      hotspotHints.classList.add("hidden");
      return;
    }

    hotspots.forEach((hs, index) => {
      const el = document.createElement("div");
      el.className = "position-marker" + (SHOW_DEBUG_HINTS ? " position-marker--debug" : "");
      el.style.left = `${hs.x * 100}%`;
      el.style.top = `${hs.y * 100}%`;
      el.style.width = `${hs.radius * 200}%`;
      el.style.height = `${hs.radius * 200}%`;
      el.style.setProperty("--flash-delay", `${index * 0.45}s`);

      el.innerHTML = `
        <span class="position-marker-ripple"></span>
        <span class="position-marker-ripple position-marker-ripple--late"></span>
        <span class="position-marker-glow"></span>
      `;
      hotspotHints.appendChild(el);
    });

    hotspotHints.classList.remove("hidden");
  }

  function renderCorrectAnswer(lv) {
    const hotspots = levelHotspots(lv);
    const correctIdx = correctIndexForLevel(lv);
    const hs = hotspots[correctIdx];
    hotspotHints.innerHTML = "";

    if (!hs) {
      hotspotHints.classList.add("hidden");
      return;
    }

    const el = document.createElement("div");
    el.className = "position-marker position-marker--answer";
    el.style.left = `${hs.x * 100}%`;
    el.style.top = `${hs.y * 100}%`;
    el.style.width = `${hs.radius * 320}%`;
    el.style.height = `${hs.radius * 320}%`;
    el.innerHTML = `
      <span class="position-marker-label" aria-hidden="true">HERE!</span>
      <span class="position-marker-ripple"></span>
      <span class="position-marker-ripple position-marker-ripple--late"></span>
      <span class="position-marker-ripple position-marker-ripple--answer"></span>
      <span class="position-marker-glow"></span>
      <span class="position-marker-ring"></span>
      <span class="position-marker-check">✓</span>
    `;
    hotspotHints.appendChild(el);
    hotspotHints.classList.remove("hidden");
  }

  function revealCorrectAnswer() {
    locked = true;
    const lv = currentLevel();
    sceneWrap.classList.add("answer-reveal");
    renderCorrectAnswer(lv);
    setVoiceStatus("Look here — this is the answer!", { speaking: false });
    setTimeout(advanceLevel, ANSWER_REVEAL_MS);
  }

  function stopQuestionSpeech() {
    if (questionAudio) {
      questionAudio.pause();
      questionAudio = null;
    }
    if (questionAudioUrl) {
      URL.revokeObjectURL(questionAudioUrl);
      questionAudioUrl = null;
    }
    questionVoiceEl.classList.remove("speaking", "error");
  }

  function createAudioFromBase64(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (questionAudioUrl) URL.revokeObjectURL(questionAudioUrl);
    const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
    questionAudioUrl = URL.createObjectURL(blob);
    return new Audio(questionAudioUrl);
  }

  function attachAudioListeners(audio, requestId) {
    audio.addEventListener("playing", () => {
      if (requestId === speakRequestId) setVoiceStatus("Listen…", { speaking: true });
    });
    audio.addEventListener("ended", () => {
      if (requestId === speakRequestId) setVoiceStatus("Tap the object!", { speaking: false });
    });
    audio.addEventListener("error", () => {
      if (requestId === speakRequestId) setVoiceStatus("Playback failed", { error: true });
    });
  }

  async function tryPlayQuestionAudio(requestId) {
    if (!questionAudio || requestId !== speakRequestId) return false;
    try {
      await questionAudio.play();
      audioUnlocked = true;
      return true;
    } catch {
      if (requestId === speakRequestId) {
        setVoiceStatus("Tap 🔁 to listen", { speaking: false });
      }
      return false;
    }
  }

  function setVoiceStatus(text, { speaking = false, error = false } = {}) {
    voiceStatusEl.textContent = text;
    questionVoiceEl.classList.toggle("speaking", speaking);
    questionVoiceEl.classList.toggle("error", error);
  }

  async function speakQuestion(text, { autoPlay = true } = {}) {
    const requestId = ++speakRequestId;
    stopQuestionSpeech();

    if (!text) {
      setVoiceStatus("No question", { error: true });
      return;
    }

    setVoiceStatus("Loading…");

    try {
      const res = await fetch("/api/inworld/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setVoiceStatus("Start server (npm start)", { error: true });
        return;
      }

      const data = await res.json();
      if (requestId !== speakRequestId) return;

      if (!res.ok) {
        setVoiceStatus(data.error || "Voice unavailable", { error: true });
        return;
      }

      if (!data.audioContent) {
        setVoiceStatus("No audio returned", { error: true });
        return;
      }

      questionAudio = createAudioFromBase64(data.audioContent, data.mimeType);
      attachAudioListeners(questionAudio, requestId);

      if (autoPlay) {
        await tryPlayQuestionAudio(requestId);
      } else {
        setVoiceStatus("Tap 🔁 to listen", { speaking: false });
      }
    } catch (err) {
      if (requestId === speakRequestId) {
        setVoiceStatus(err.message || "Voice unavailable", { error: true });
      }
    }
  }

  function replayQuestion() {
    if (gameOver || locked) return;
    const lv = currentLevel();
    if (!lv?.sentence) return;

    audioUnlocked = true;

    if (questionAudio) {
      questionAudio.currentTime = 0;
      questionAudio.play().then(() => {
        setVoiceStatus("Listen…", { speaking: true });
      }).catch(() => {
        speakQuestion(lv.sentence, { autoPlay: true });
      });
      return;
    }

    speakQuestion(lv.sentence, { autoPlay: true });
  }

  function updateHud() {
    const lv = currentLevel();
    if (!lv) return;
    sceneWrap.classList.remove("answer-reveal");
    wrongAttempts = 0;
    sentenceEl.textContent = lv.sentence;
    foundValEl.textContent = String(foundCount);
    scoreValEl.textContent = String(score);
    applyLevelScene(lv);
    renderPositionMarkers(levelHotspots(lv));
    speakQuestion(lv.sentence);
  }

  function spawnClickFx(x, y, correct) {
    const ring = document.createElement("div");
    ring.className = `click-ring ${correct ? "correct" : "wrong"}`;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    clickFx.appendChild(ring);
    setTimeout(() => ring.remove(), 650);
  }

  function correctIndexForLevel(lv) {
    const hotspots = levelHotspots(lv);
    const idx = Number(lv.target);
    if (Number.isInteger(idx) && idx >= 0 && idx < hotspots.length) return idx;
    const legacy = hotspots.findIndex(
      (h) =>
        String(h.target || "").trim().toLowerCase() ===
        String(lv.target || "").trim().toLowerCase()
    );
    return legacy >= 0 ? legacy : 0;
  }

  function findHitHotspotIndex(nx, ny, hotspots) {
    return hotspots.findIndex((hs) => {
      const dx = nx - hs.x;
      const dy = ny - hs.y;
      return Math.sqrt(dx * dx + dy * dy) <= hs.radius;
    });
  }

  function isCorrectHit(hitIndex, lv) {
    if (hitIndex < 0) return false;
    return hitIndex === correctIndexForLevel(lv);
  }

  function onSceneClick(e) {
    if (locked || gameOver) return;
    const lv = currentLevel();
    const hotspots = levelHotspots(lv);
    if (!hotspots.length) return;

    const rect = sceneImg.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

    const localX = e.clientX - sceneWrap.getBoundingClientRect().left;
    const localY = e.clientY - sceneWrap.getBoundingClientRect().top;
    const hitIndex = findHitHotspotIndex(nx, ny, hotspots);
    const correct = isCorrectHit(hitIndex, lv);
    spawnClickFx(localX, localY, correct);

    if (correct) {
      locked = true;
      renderPositionMarkers([]);
      score += POINTS_PER_LEVEL;
      foundCount += 1;
      scoreValEl.textContent = String(score);
      foundValEl.textContent = String(foundCount);
      setTimeout(advanceLevel, 500);
    } else {
      wrongAttempts += 1;
      sceneWrap.classList.add("shake");
      setTimeout(() => sceneWrap.classList.remove("shake"), 400);
      if (wrongAttempts >= MAX_WRONG_ATTEMPTS) {
        revealCorrectAnswer();
      }
    }
  }

  function advanceLevel() {
    if (gameOver) return;
    locked = false;
    if (timeLeft <= 0) {
      showGameOver();
      return;
    }
    currentIndex = pickRandomLevelIndex(currentIndex);
    updateHud();
  }

  function showGameOver() {
    if (gameOver) return;
    gameOver = true;
    locked = true;
    stopTimer();
    stopQuestionSpeech();
    renderPositionMarkers([]);
    overlayTitle.textContent = "Time's up!";
    overlayMsg.textContent = `You found ${foundCount} object${foundCount === 1 ? "" : "s"}. Score: ${score}`;
    overlay.classList.remove("hidden");
    if (typeof GameScoreReporter !== "undefined") {
      GameScoreReporter.reportGameScore("findgame", score, { foundCount, timeLeft });
    }
  }

  function startGame() {
    gameOver = false;
    currentIndex = pickRandomLevelIndex();
    score = 0;
    foundCount = 0;
    locked = false;
    stopQuestionSpeech();
    overlay.classList.add("hidden");
    updateHud();
    startTimer();
  }

  async function init() {
    if (typeof FindImageConfig !== "undefined") {
      await FindImageConfig.applyAll();
      await GameLoadingScreen.preloadImageConfig(FindImageConfig);
    }

    await loadLevels();
    if (!levels.length) {
      voiceStatusEl.textContent = "No levels configured";
      await GameLoadingScreen.hide();
      return;
    }

    sceneWrap.addEventListener("click", onSceneClick);
    replayBtn.addEventListener("click", replayQuestion);
    overlayBtn.addEventListener("click", () => {
      audioUnlocked = true;
      startGame();
    });

    const firstLevel = levels[pickRandomLevelIndex()];
    const firstSceneUrl = levelSceneUrl(firstLevel);
    if (firstSceneUrl) await GameLoadingScreen.preloadImage(firstSceneUrl);

    fitGameToScreen();
    startGame();
    await GameLoadingScreen.hide();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", fitGameToScreen);
  setTimeout(fitGameToScreen, 50);
})();
