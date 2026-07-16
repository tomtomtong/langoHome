/* ===========================================================
   Word-Whack Blitz — game logic
   =========================================================== */

(() => {
  "use strict";

  // ---------- Puzzle data ----------
  const PUZZLES = [
    {
      prompt: "Apple is",
      correct:  ["RED", "GREEN", "SWEET", "JUICY", "CRUNCHY", "FRUIT", "TART", "FOOD"],
      distractors: ["LOUD", "METAL", "SQUARE", "SILENT", "LIQUID", "SHINY", "FAST"],
    },
    {
      prompt: "The sky is",
      correct:  ["BLUE", "HIGH", "CLEAR", "BRIGHT", "CLOUDY", "VAST", "GRAY", "BIG"],
      distractors: ["SWEET", "FURRY", "METAL", "SQUARE", "LIQUID", "SILENT"],
    },
    {
      prompt: "A dog is",
      correct:  ["FURRY", "LOYAL", "FAST", "LOUD", "FRIENDLY", "PLAYFUL", "BROWN", "ANIMAL"],
      distractors: ["COLD", "LIQUID", "METAL", "SHINY", "SQUARE", "FROZEN"],
    },
    {
      prompt: "Ice is",
      correct:  ["COLD", "SOLID", "SLIPPERY", "CLEAR", "WHITE", "FROZEN", "HARD", "CHILLY"],
      distractors: ["HOT", "SWEET", "LOUD", "RED", "FURRY", "METAL", "FAST"],
    },
    {
      prompt: "The sun is",
      correct:  ["HOT", "BRIGHT", "YELLOW", "ROUND", "WARM", "SHINY", "STAR", "FAR"],
      distractors: ["COLD", "BLUE", "FURRY", "SILENT", "SQUARE", "LIQUID"],
    },
    {
      prompt: "A book is",
      correct:  ["FUNNY", "LONG", "INTERESTING", "HEAVY", "PAPER", "QUIET", "THICK", "READABLE"],
      distractors: ["JUICY", "FURRY", "COLD", "LOUD", "LIQUID", "YELLOW", "SWEET"],
    },
    {
      prompt: "A cat is",
      correct:  ["QUIET", "SOFT", "FURRY", "CLEVER", "SNEAKY", "AGILE", "CUTE", "ANIMAL"],
      distractors: ["METAL", "SQUARE", "LOUD", "HOT", "FROZEN", "SHINY"],
    },
    {
      prompt: "Honey is",
      correct:  ["SWEET", "STICKY", "GOLDEN", "THICK", "TASTY", "FOOD", "YUMMY", "SMOOTH"],
      distractors: ["COLD", "LOUD", "SQUARE", "FURRY", "METAL", "SILENT"],
    },
  ];

  // ---------- Config ----------
  const HOLE_COUNT = 8;
  const ROUND_TIME = 90;
  const BASE_POINTS = 10;
  const COMBO_BONUS = 2;
  const MAX_SCORE_GOAL = 280;
  const STAR_THRESHOLDS = [
    { stars: 1, questions: 8,  score: 90  },
    { stars: 2, questions: 14, score: 180 },
    { stars: 3, questions: 20, score: 280 },
  ];
  const CORRECT_MOLES_MIN = 2;
  const CORRECT_MOLES_MAX = 3;
  const NEXT_ROUND_DELAY = 700;
  const MISSES_BEFORE_REVEAL = 2;
  const REVEAL_ROUND_DELAY = 7000;
  const HIT_REACTION_DELAY = 430;

  const MOLE_ACTIONS = [
    "hello",
    "hat-tip",
    "curious-left",
    "curious-right",
    "magic",
    "confident",
    "startled",
    "bounce",
  ];

  const TOMMY_POSE_BY_ACTION = {
    "hello": "assets/images/tommy/tommy-base.png",
    "hat-tip": "assets/images/tommy/tommy-base.png",
    "curious-left": "assets/images/tommy/tommy-base.png",
    "curious-right": "assets/images/tommy/tommy-base.png",
    "magic": "assets/images/tommy/tommy-base.png",
    "confident": "assets/images/tommy/tommy-base.png",
    "startled": "assets/images/tommy/tommy-base.png",
    "bounce": "assets/images/tommy/tommy-base.png",
  };

  const GENERIC_DISTRACTORS = ["LOUD", "COLD", "FAST", "BLUE", "METAL", "SILENT", "SQUARE", "HOT"];

  // ---------- State ----------
  const state = {
    running: false,
    score: 0,
    time: ROUND_TIME,
    combo: 0,
    maxCombo: 0,
    questionsAnswered: 0,
    lastPuzzleIdx: -1,
    lastTargetWord: null,
    puzzle: null,
    roundMisses: 0,
    roundCorrectWords: [],
    roundBusy: false,
    holes: [],
    tickTimer: null,
    nextRoundTimer: null,
    lastProgressPct: 0,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const timerVal = $("timerVal");
  const scoreVal = $("scoreVal");
  const questionVal = $("questionVal");
  const comboVal = $("comboVal");
  const comboChip = $("comboChip");
  const sentenceEl = $("sentence");
  const progressFill = $("progressFill");
  const progressFrame = document.querySelector(".progress-frame");
  const overlay = $("overlay");
  const fxLayer = $("fx");
  const timerWrap = document.querySelector(".timer-chip");
  const Sfx = window.GameSfx || { play() {} };
  const Bgm = window.GameBgm || { play() {}, pause() {} };

  const DESIGN_W = 960;
  const DESIGN_H = 720;

  function fitGameToScreen() {
    const gameEl = $("game");
    if (!gameEl) return;
    const viewport = window.visualViewport;
    const winW = viewport ? viewport.width : window.innerWidth;
    const winH = viewport ? viewport.height : window.innerHeight;
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

  // ---------- Build grid ----------
  function buildGrid() {
    grid.innerHTML = "";
    state.holes = [];
    for (let i = 0; i < HOLE_COUNT; i++) {
      const hole = document.createElement("div");
      hole.className = "hole";
      hole.dataset.idx = i;
      hole.innerHTML = `
        <div class="hole-mound">
          <div class="hole-ellip"></div>
          <div class="mole-clip">
            <div class="mole">
              <div class="mole-actor">
                <div class="mole-body">
                  <img class="mole-img mole-img-normal" src="assets/images/tommy/tommy-base.png" alt="Tommy" />
                  <img class="mole-img mole-img-hit" src="assets/images/tommy/tommy-base.png" alt="" aria-hidden="true" />
                </div>
                <div class="hit-expression" aria-hidden="true"><span></span><span></span></div>
                <div class="mole-face"><div class="eye"></div><div class="eye"></div></div>
                <div class="mole-nose"></div>
                <div class="mole-teeth"></div>
              </div>
              <div class="hit-burst" aria-hidden="true"><span>★</span><span>✦</span><span>★</span></div>
              <div class="word-sign"></div>
            </div>
          </div>
          <div class="hole-lip"></div>
        </div>`;
      grid.appendChild(hole);
      const mole = hole.querySelector(".mole");
      const obj = {
        el: hole,
        mole: mole,
        wordSign: hole.querySelector(".word-sign"),
        up: false,
        word: null,
        correct: false,
        whacked: false,
        action: null,
        hitTimer: null,
        normalImg: hole.querySelector(".mole-img-normal"),
      };
      mole.addEventListener("click", () => whack(obj));
      mole.addEventListener("touchstart", (e) => { e.preventDefault(); whack(obj); }, { passive: false });
      state.holes.push(obj);
    }
    if (typeof ImageConfig !== "undefined" && ImageConfig.applyDynamicSlots) {
      ImageConfig.applyDynamicSlots();
    }
  }

  // ---------- Puzzle setup ----------
  function pickBuiltinPuzzle() {
    let idx;
    do {
      idx = Math.floor(Math.random() * PUZZLES.length);
    } while (PUZZLES.length > 1 && idx === state.lastPuzzleIdx);
    state.lastPuzzleIdx = idx;
    state.puzzle = PUZZLES[idx];
    return state.puzzle;
  }

  function titleCase(word) {
    const trimmed = String(word || "").trim();
    if (!trimmed) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  async function fetchLlmRound(targetWord, otherWords) {
    const res = await fetch("/api/inworld/llm/wordwhack-round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetWord, otherWords }),
    });
    if (!res.ok) throw new Error("LLM round failed");
    const data = await res.json();
    if (!data?.prompt || !Array.isArray(data.correct) || !Array.isArray(data.distractors)) {
      throw new Error("Invalid LLM round payload");
    }
    return data;
  }

  function buildFallbackVocaRound(targetWord, otherWords) {
    const target = targetWord.trim().toUpperCase();
    const pool = otherWords
      .map((word) => word.trim().toUpperCase())
      .filter((word) => word && word !== target);
    const correct = [target, ...shuffle(pool).slice(0, 2)];
    let distractors = shuffle(pool).filter((word) => !correct.includes(word));
    for (const word of GENERIC_DISTRACTORS) {
      if (distractors.length >= HOLE_COUNT) break;
      if (!correct.includes(word) && !distractors.includes(word)) distractors.push(word);
    }
    return {
      prompt: `The word is ${titleCase(targetWord)} — it is`,
      correct,
      distractors,
    };
  }

  async function pickVocaRound() {
    const vocabItems = VocaConfig.getItems()
      .map((item) => item.word.trim())
      .filter(Boolean);
    if (vocabItems.length < 3) {
      return pickBuiltinPuzzle();
    }

    const targetItem = VocaConfig.pickRandomOne(state.lastTargetWord);
    if (!targetItem?.word) {
      return pickBuiltinPuzzle();
    }

    const targetWord = targetItem.word.trim();
    state.lastTargetWord = targetWord;
    const otherWords = vocabItems.filter(
      (word) => word.toLowerCase() !== targetWord.toLowerCase()
    );

    try {
      const round = await fetchLlmRound(targetWord, otherWords);
      const targetUpper = targetWord.toUpperCase();
      const correct = round.correct
        .map((word) => String(word).trim().toUpperCase())
        .filter(Boolean);
      if (!correct.includes(targetUpper)) correct.unshift(targetUpper);

      const distractors = round.distractors
        .map((word) => String(word).trim().toUpperCase())
        .filter((word) => word && !correct.includes(word));

      state.puzzle = {
        prompt: round.prompt.trim(),
        correct: [...new Set(correct)],
        distractors: [...new Set(distractors)],
      };
    } catch {
      state.puzzle = buildFallbackVocaRound(targetWord, otherWords);
    }

    return state.puzzle;
  }

  async function pickPuzzle() {
    if (typeof VocaConfig !== "undefined" && VocaConfig.hasItems()) {
      return pickVocaRound();
    }
    return pickBuiltinPuzzle();
  }

  function renderSentence(prompt, answer) {
    if (answer) {
      sentenceEl.innerHTML = `${escapeHtml(prompt)} <span class="answer">${escapeHtml(answer)}</span>`;
      return;
    }
    sentenceEl.innerHTML = `${escapeHtml(prompt)} <span class="blank">&nbsp;</span>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildRoundWords(puzzle) {
    const correctCount = Math.min(
      CORRECT_MOLES_MAX,
      Math.max(CORRECT_MOLES_MIN, puzzle.correct.length),
      HOLE_COUNT - 1
    );
    const correctWords = shuffle([...puzzle.correct]).slice(0, correctCount);
    const distractorCount = HOLE_COUNT - correctWords.length;
    let distractors = shuffle([...puzzle.distractors]).slice(0, distractorCount);

    while (distractors.length < distractorCount) {
      distractors.push(puzzle.distractors[distractors.length % puzzle.distractors.length]);
    }

    return shuffle([
      ...correctWords.map((word) => ({ word, correct: true })),
      ...distractors.map((word) => ({ word, correct: false })),
    ]);
  }

  function resetHoles() {
    state.holes.forEach((hole) => {
      clearTimeout(hole.hitTimer);
      hole.hitTimer = null;
      hole.up = false;
      hole.whacked = false;
      hole.word = null;
      hole.correct = false;
      hole.el.classList.remove("up", "whacked", "waiting", "hit-reacting", "hit-good", "hit-bad", "reveal");
      hole.mole.classList.remove("hit-good", "hit-bad", "reveal-hint");
      MOLE_ACTIONS.forEach((action) => hole.mole.classList.remove(`action-${action}`));
      hole.wordSign.textContent = "";
    });
  }

  function setHoleAction(hole, action) {
    MOLE_ACTIONS.forEach((name) => hole.mole.classList.remove(`action-${name}`));
    hole.action = action;
    hole.mole.classList.add(`action-${action}`);

    if (hole.normalImg) {
      const poseUrl = TOMMY_POSE_BY_ACTION[action] || TOMMY_POSE_BY_ACTION.bounce;
      hole.normalImg.dataset.defaultSrc = poseUrl;
      hole.normalImg.src = poseUrl;
    }
  }

  function spawnRoundMoles() {
    const words = buildRoundWords(state.puzzle);
    const actions = shuffle([...MOLE_ACTIONS]);
    resetHoles();
    state.roundMisses = 0;
    state.roundCorrectWords = words.filter((w) => w.correct).map((w) => w.word);

    state.holes.forEach((hole, i) => {
      const { word, correct } = words[i];
      hole.word = word;
      hole.correct = correct;
      hole.wordSign.textContent = word;
      setHoleAction(hole, actions[i]);
      void hole.mole.offsetWidth;
      hole.el.classList.add("up", "waiting");
      hole.up = true;
    });
  }

  async function loadRound() {
    if (!state.running) return;
    state.roundBusy = true;
    renderSentence("Thinking…");
    resetHoles();
    await pickPuzzle();
    state.roundBusy = false;
    renderSentence(state.puzzle.prompt);
    spawnRoundMoles();
  }

  function retractMole(hole, delay = 0) {
    if (!hole.up) return;
    hole.up = false;
    hole.whacked = true;

    const retract = () => {
      hole.el.classList.remove("up", "waiting", "hit-reacting");
      hole.el.classList.add("whacked");
    };

    if (delay > 0) {
      hole.el.classList.remove("waiting");
      hole.el.classList.add("hit-reacting");
      clearTimeout(hole.hitTimer);
      hole.hitTimer = setTimeout(retract, delay);
      return;
    }

    retract();
  }

  function remainingCorrectMoles() {
    return state.holes.filter((hole) => hole.up && hole.correct).length;
  }

  function revealCorrectAnswer() {
    state.roundBusy = true;

    const visibleCorrect = state.holes.filter((hole) => hole.up && hole.correct);
    visibleCorrect.forEach((hole) => {
      hole.el.classList.add("reveal");
      hole.mole.classList.add("reveal-hint");
    });

    const answers = visibleCorrect.length
      ? visibleCorrect.map((hole) => hole.word)
      : state.roundCorrectWords;
    const answerText = answers.join(" / ");
    renderSentence(state.puzzle.prompt, answers[0]);
    flashMessage(`Correct answer: ${answerText}`, REVEAL_ROUND_DELAY);

    clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = setTimeout(() => {
      if (state.running) loadRound();
    }, REVEAL_ROUND_DELAY);
  }

  function scheduleRoundRetry(message) {
    state.roundBusy = true;
    flashMessage(message);
    clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = setTimeout(() => {
      if (state.running) {
        state.roundBusy = false;
        spawnRoundMoles();
      }
    }, NEXT_ROUND_DELAY);
  }

  // ---------- Whacking ----------
  function whack(hole) {
    if (!state.running || !hole.up || hole.whacked || state.roundBusy) return;

    if (hole.correct) {
      state.roundBusy = true;
      hole.mole.classList.add("hit-good");
      Sfx.play("correct", { rate: Math.min(1.28, 1 + state.combo * 0.035) });
      const gain = BASE_POINTS + state.combo * COMBO_BONUS;
      addScore(gain);
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.questionsAnswered++;
      if (questionVal) questionVal.textContent = state.questionsAnswered;
      floatText(hole.el, `+${gain}`, true);
      renderCombo();
      pulseCombo();
      updateProgress();
      renderSentence(state.puzzle.prompt, hole.word);

      state.holes.forEach((h) => {
        if (h !== hole && h.up) retractMole(h);
      });
      retractMole(hole, HIT_REACTION_DELAY);

      clearTimeout(state.nextRoundTimer);
      state.nextRoundTimer = setTimeout(() => {
        if (state.running) loadRound();
      }, NEXT_ROUND_DELAY);
      return;
    }

    hole.mole.classList.add("hit-bad");
    Sfx.play("wrong");
    state.combo = 0;
    state.roundMisses++;
    floatText(hole.el, "Miss!", false);
    pulseCombo(true);
    shakeScreen();
    renderCombo();
    retractMole(hole, HIT_REACTION_DELAY);

    if (state.roundMisses >= MISSES_BEFORE_REVEAL) {
      revealCorrectAnswer();
      return;
    }

    if (remainingCorrectMoles() === 0) {
      scheduleRoundRetry("Try again! New moles incoming");
    }
  }

  function addScore(delta) {
    state.score = Math.max(0, state.score + delta);
    scoreVal.textContent = String(state.score);
  }

  function renderCombo() {
    if (comboVal) comboVal.textContent = state.combo;
  }

  function pulseCombo(reset) {
    if (!comboChip) return;
    comboChip.classList.remove("hot");
    void comboChip.offsetWidth;
    if (!reset && state.combo > 0) comboChip.classList.add("hot");
    if (reset) comboChip.style.background = "#ffd6d6";
    else comboChip.style.background = "";
    setTimeout(() => { comboChip.style.background = ""; }, 250);
  }

  function getStarsEarned() {
    let earned = 0;
    for (const t of STAR_THRESHOLDS) {
      if (state.questionsAnswered >= t.questions && state.score >= t.score) {
        earned = t.stars;
      }
    }
    return earned;
  }

  function celebrateProgressStar(star) {
    star.classList.remove("just-earned");
    void star.offsetWidth;
    star.classList.add("just-earned");
    if (progressFrame) {
      progressFrame.classList.remove("milestone-celebrate");
      void progressFrame.offsetWidth;
      progressFrame.classList.add("milestone-celebrate");
    }
    Sfx.play("star");
  }

  function updateProgress() {
    const pct = Math.min(100, (state.score / MAX_SCORE_GOAL) * 100);
    const advanced = pct > state.lastProgressPct;
    state.lastProgressPct = pct;
    progressFill.style.width = `${pct}%`;

    if (advanced && progressFrame) {
      progressFrame.classList.remove("progress-bump");
      void progressFrame.offsetWidth;
      progressFrame.classList.add("progress-bump");
    }

    document.querySelectorAll(".star-milestone").forEach((s) => {
      const m = parseInt(s.dataset.milestone, 10);
      const threshold = STAR_THRESHOLDS.find((t) => t.stars === m);
      if (threshold && state.questionsAnswered >= threshold.questions && state.score >= threshold.score) {
        const justEarned = !s.classList.contains("earned");
        s.classList.add("earned");
        if (justEarned) celebrateProgressStar(s);
      } else {
        s.classList.remove("earned", "just-earned");
      }
    });
  }

  // ---------- FX ----------
  function floatText(holeEl, text, good) {
    const rect = holeEl.getBoundingClientRect();
    const sceneRect = fxLayer.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "float-text " + (good ? "good" : "bad");
    el.textContent = text;
    el.style.left = (rect.left - sceneRect.left + rect.width / 2) + "px";
    el.style.top  = (rect.top  - sceneRect.top  + 30) + "px";
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function shakeScreen() {
    const scene = document.getElementById("game");
    scene.classList.remove("shake");
    void scene.offsetWidth;
    scene.style.animation = "none";
    void scene.offsetWidth;
    scene.style.transition = "transform 0.06s ease";
    let i = 0;
    const seq = [-8, 7, -5, 4, 0];
    const step = () => {
      if (i >= seq.length) { scene.style.transform = ""; return; }
      scene.style.transform = `translateX(${seq[i++]}px)`;
      setTimeout(step, 60);
    };
    step();
  }

  function flashMessage(text, duration = 1200) {
    const el = document.createElement("div");
    el.className = "float-text good" + (duration > 1200 ? " persist" : "");
    el.textContent = text;
    el.style.fontSize = "1.4rem";
    el.style.left = "50%";
    el.style.top = "40%";
    el.style.transform = "translate(-50%, 0)";
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    state.tickTimer = setInterval(() => {
      state.time -= 1;
      if (state.time <= 0) {
        state.time = 0;
        renderTimer();
        gameOver();
        return;
      }
      renderTimer();
      updateProgress();
      if (state.time <= 10) Sfx.play("warning");
    }, 1000);
  }

  function stopTimer() {
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
  }

  function renderTimer() {
    timerVal.textContent = String(state.time).padStart(2, "0");
    if (state.time <= 10) timerWrap.classList.add("timer-low");
    else timerWrap.classList.remove("timer-low");
  }

  // ---------- Game flow ----------
  function startGame() {
    Sfx.play("ready");
    Bgm.play("wordwhack");
    state.running = true;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.time = ROUND_TIME;
    state.questionsAnswered = 0;
    state.lastPuzzleIdx = -1;
    state.lastTargetWord = null;
    state.roundBusy = false;
    state.lastProgressPct = 0;

    if (questionVal) questionVal.textContent = 0;
    scoreVal.textContent = "0";
    renderCombo();
    renderTimer();
    updateProgress();

    clearTimeout(state.nextRoundTimer);
    resetHoles();
    overlay.classList.add("hidden");
    startTimer();
    loadRound();
  }

  function gameOver() {
    state.running = false;
    stopTimer();
    clearTimeout(state.nextRoundTimer);
    resetHoles();
    Bgm.pause();
    // Celebration SFX is played by GameResult.

    const stars = getStarsEarned();
    if (typeof GameScoreReporter !== 'undefined') {
      GameScoreReporter.reportGameScore('wordwhack', state.score, {
        stars,
        questionsAnswered: state.questionsAnswered,
        maxCombo: state.maxCombo,
      });
    }
    if (typeof GameResult !== "undefined") {
      GameResult.show({
        stars: Math.max(1, stars),
        score: state.score,
        onPlayAgain: startGame,
      });
      return;
    }
    showOverlay({
      title: "Time's up!",
      subtitle: "Round over. Here's your score:",
      stats: [
        { l: "Score", v: state.score },
        { l: "Correct answers", v: state.questionsAnswered },
        { l: "Stars earned", v: "★".repeat(stars) + "☆".repeat(3 - stars) },
        { l: "Best combo", v: state.maxCombo },
      ],
    });
  }

  async function showOverlay({ title, subtitle, stats }) {
    let statsHtml = "";
    if (stats && stats.length) {
      statsHtml = `<div class="stats">` +
        stats.map((s) => `<div class="stat"><span class="v">${s.v}</span><span class="l">${s.l}</span></div>`).join("") +
        `</div>`;
    }
    overlay.querySelector(".panel").innerHTML = `
      <h1 class="title">${title}</h1>
      <p class="subtitle">${subtitle}</p>
      ${statsHtml}
      <div class="overlay-actions">
        <button id="startBtn" class="btn">Play again</button>
        <button id="returnOverlayBtn" class="btn btn-secondary" type="button">Return</button>
      </div>
      <div class="legend">
        <div class="legend-row"><span class="dot good"></span> Correct → +10 base points, +2 per combo streak</div>
        <div class="legend-row"><span class="dot bad"></span> Wrong → no penalty, but combo resets</div>
      </div>`;
    document.getElementById("startBtn").addEventListener("click", startGame);
    document.getElementById("returnOverlayBtn").addEventListener("click", () => {
      if (typeof window.returnToConversation === "function") window.returnToConversation();
      else window.location.assign("/?connect=1");
    });
    overlay.classList.remove("hidden");
    if (typeof ImageConfig !== "undefined") await ImageConfig.applyAll();
  }

  // ---------- Dev / debug shortcuts ----------
  function onKeyDown(e) {
    if (e.key !== "q" && e.key !== "Q") return;
    if (!state.running || !overlay.classList.contains("hidden")) return;
    e.preventDefault();
    gameOver();
  }

  // ---------- Init ----------
  async function init() {
    buildGrid();
    if (typeof VocaConfig !== "undefined") {
      await VocaConfig.loadFromServer();
    }
    if (typeof ImageConfig !== "undefined") {
      await ImageConfig.applyAll();
      await GameLoadingScreen.preloadImageConfig(ImageConfig);
    }
    document.addEventListener("keydown", onKeyDown);
    startGame();
    await GameLoadingScreen.hide();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
