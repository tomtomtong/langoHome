const CARD_BACK_IMAGES = [];
const CARD_BACK_IMAGES_UPDATED = [];

const DEFAULT_PAIRS = [
  { img: '🐱', word: 'Cat' },
  { img: '🐶', word: 'Dog' },
  { img: '🍎', word: 'Apple' },
  { img: '🚗', word: 'Car' },
  { img: '🌸', word: 'Flower' },
  { img: '🏠', word: 'House' }
];

const ROUND_PAIR_COUNT = 6;
let roundPairs = DEFAULT_PAIRS.slice();
let totalPairs = roundPairs.length;
const ROUND_TIME = 90;
const PREVIEW_TIME = 4;
const BASE_SCORE = 10;
const MAX_COMBO_MULTIPLIER = 4;
const FULL_CLEAR_BONUS = 100;
const STAR_THRESHOLDS = [150, 251, 451];

let deck = [];
let cardBackAssignments = [];
let flippedCards = [];
let matchedCount = 0;
let score = 0;
let combo = 0;
let timeLeft = ROUND_TIME;
let timerId = null;
let lockBoard = false;
let gameOver = false;
let previewMode = false;
let previewTimeoutId = null;
let resolveTimeoutId = null;

const board = document.getElementById('board');
const timerEl = document.getElementById('timer');
const timerTextEl = document.getElementById('timer-text');
const pairsFoundEl = document.getElementById('pairs-found');
const scoreEl = document.getElementById('score-text');
const levelCompleteEl = document.getElementById('level-complete');
const completeStarsEl = document.getElementById('complete-stars');
const completeScoreEl = document.getElementById('complete-score');
const timerDisplayEl = document.getElementById('timer-display');
const timerUnitEl = document.querySelector('.timer-unit');
const soundToggleEl = document.getElementById('sound-toggle');
const announcerEl = document.getElementById('game-announcer');

const Sfx = (() => {
  const files = {
    flip: 'assets/audio/card-flip.wav',
    match: 'assets/audio/match.ogg',
    mismatch: 'assets/audio/mismatch.ogg',
    star: 'assets/audio/star.ogg',
    clear: 'assets/audio/board-clear.ogg',
    warning: 'assets/audio/warning-tick.ogg',
    gameover: 'assets/audio/game-over.ogg',
    ready: 'assets/audio/ready-shuffle.wav',
  };
  const volumes = {
    flip: 0.45,
    match: 0.46,
    mismatch: 0.38,
    star: 0.46,
    clear: 0.5,
    warning: 0.24,
    gameover: 0.4,
    ready: 0.34,
  };
  const recorded = new Map();
  let context = null;
  let master = null;
  let activated = false;
  let muted = false;
  try {
    muted = localStorage.getItem('cardgame-muted') === '1';
  } catch {
    muted = false;
  }

  function ensureContext() {
    if (context) {
      if (context.state === 'suspended') context.resume();
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
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.35, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playSynth(name) {
    if (name === 'flip') {
      tone(360, 0.07, { endFrequency: 620, type: 'triangle', volume: 0.22 });
    } else if (name === 'match') {
      tone(523.25, 0.16, { type: 'sine', volume: 0.32 });
      tone(659.25, 0.18, { delay: 0.08, type: 'sine', volume: 0.3 });
      tone(783.99, 0.22, { delay: 0.16, type: 'sine', volume: 0.28 });
    } else if (name === 'mismatch') {
      tone(210, 0.15, { endFrequency: 150, type: 'square', volume: 0.14 });
      tone(145, 0.18, { delay: 0.09, endFrequency: 110, type: 'triangle', volume: 0.18 });
    } else if (name === 'star') {
      [880, 1108.73, 1318.51].forEach((freq, index) => {
        tone(freq, 0.3, { delay: index * 0.07, type: 'sine', volume: 0.2 });
      });
    } else if (name === 'clear') {
      [392, 523.25, 659.25, 783.99].forEach((freq, index) => {
        tone(freq, 0.3, { delay: index * 0.09, type: 'triangle', volume: 0.26 });
      });
    } else if (name === 'warning') {
      tone(760, 0.055, { type: 'square', volume: 0.1 });
    } else if (name === 'gameover') {
      tone(392, 0.25, { endFrequency: 330, type: 'triangle', volume: 0.22 });
      tone(293.66, 0.35, { delay: 0.18, endFrequency: 220, type: 'triangle', volume: 0.2 });
    } else if (name === 'ready') {
      tone(440, 0.12, { type: 'sine', volume: 0.18 });
      tone(659.25, 0.2, { delay: 0.1, type: 'sine', volume: 0.2 });
    }
  }

  function preload() {
    if (typeof Audio === 'undefined') return;
    Object.entries(files).forEach(([name, src]) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      recorded.set(name, audio);
    });
  }

  function play(name) {
    if (muted || !activated) return;
    const template = recorded.get(name);
    if (!template) {
      playSynth(name);
      return;
    }
    const audio = template.cloneNode();
    audio.volume = volumes[name] ?? 0.4;
    const playback = audio.play();
    if (playback?.catch) {
      playback.catch(() => playSynth(name));
    }
  }

  function unlock() {
    activated = true;
    ensureContext();
  }

  function setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem('cardgame-muted', muted ? '1' : '0');
    } catch {
      /* Storage may be unavailable in embedded browsers. */
    }
    if (!muted) {
      unlock();
      play('ready');
    }
    return muted;
  }

  return {
    play,
    preload,
    unlock,
    isMuted: () => muted,
    toggle: () => setMuted(!muted),
  };
})();

function announce(message) {
  if (!announcerEl) return;
  announcerEl.textContent = '';
  requestAnimationFrame(() => {
    announcerEl.textContent = message;
  });
}

function replayAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function syncSoundButton() {
  if (!soundToggleEl) return;
  const muted = Sfx.isMuted();
  soundToggleEl.textContent = muted ? '🔇' : '🔊';
  soundToggleEl.setAttribute('aria-pressed', muted ? 'true' : 'false');
  soundToggleEl.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
  soundToggleEl.title = muted ? 'Turn sound on' : 'Mute sound';
}

/* --- Responsive scaling to fit screen (max scale 4.0 for bigger display) --- */
function fitGameToScreen() {
  const gameEl = document.getElementById('game');
  if (!gameEl) return;
  const baseW = 800;
  const baseH = 600;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const scaleX = winW / baseW;
  const scaleY = winH / baseH;
  const scale = Math.min(scaleX, scaleY, 4.0);
  gameEl.style.transform = 'scale(' + scale + ')';
  gameEl.style.transformOrigin = 'center center';
}
window.addEventListener('resize', fitGameToScreen);
window.addEventListener('load', fitGameToScreen);
setTimeout(fitGameToScreen, 50);

function pickRoundPairs() {
  if (typeof VocaConfig !== 'undefined' && VocaConfig.hasItems()) {
    const picked = VocaConfig.pickRoundPairs(ROUND_PAIR_COUNT);
    if (picked.length) {
      roundPairs = picked.map((item) => {
        const img = item.imageUrl || item.imageProxyUrl || '';
        return {
          word: item.word,
          img,
          textOnly: !img,
        };
      });
      totalPairs = roundPairs.length;
      return;
    }
  }
  roundPairs = DEFAULT_PAIRS.map((pair) => ({
    word: pair.word,
    img: pair.img,
    textOnly: false,
  }));
  totalPairs = roundPairs.length;
}

function isRenderableImage(content) {
  if (typeof content !== 'string') return false;
  const value = content.trim();
  if (!value) return false;
  return /^https?:\/\//i.test(value) || value.startsWith('/api/voca/');
}

function setCardFace(el, card) {
  el.classList.remove('word');
  el.textContent = '';
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';

  if (card.type === 'word') {
    el.classList.add('word');
    el.textContent = card.content;
    return;
  }

  if (isRenderableImage(card.content)) {
    el.classList.add('img-card');
    const img = document.createElement('img');
    img.className = 'card-voca-img';
    img.src = card.content;
    img.alt = card.content.startsWith('/api/voca/') ? '' : card.content;
    el.appendChild(img);
    return;
  }

  el.textContent = card.content;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardBackUrl() {
  return 'assets/images/card-back.png';
}

function cardBackBackgroundSize(scale) {
  if (scale === 1) return 'cover';
  const pct = `${Math.round(100 * scale)}%`;
  return `${pct} ${pct}`;
}

function applyCardBackStyle(el) {
  const url = getCardBackUrl();
  const scale = 1;
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = cardBackBackgroundSize(scale);
  el.style.backgroundPosition = 'center';
  el.style.backgroundColor = 'transparent';
  el.textContent = '';
}

function buildDeck() {
  deck = [];
  roundPairs.forEach((p, idx) => {
    if (p.textOnly) {
      deck.push({ pairId: idx, type: 'word', content: p.word, matched: false });
      deck.push({ pairId: idx, type: 'word', content: p.word, matched: false });
      return;
    }
    deck.push({ pairId: idx, type: 'img', content: p.img, matched: false });
    deck.push({ pairId: idx, type: 'word', content: p.word, matched: false });
  });
  shuffle(deck);
  // Use updated images if deck size matches
  let backImgs;
  if (deck.length <= CARD_BACK_IMAGES_UPDATED.length) {
    backImgs = CARD_BACK_IMAGES_UPDATED.slice(0, deck.length);
  } else {
    backImgs = CARD_BACK_IMAGES.slice(0, deck.length);
  }
  shuffle(backImgs);
  cardBackAssignments = backImgs;
}

function updateProgressBar() {
  const maxScore = STAR_THRESHOLDS[2];
  const pct = Math.min(100, (score / maxScore) * 100);
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = pct + '%';

  document.querySelectorAll('.star-milestone').forEach((s) => {
    const m = parseInt(s.dataset.milestone, 10);
    const threshold = STAR_THRESHOLDS[m - 1];
    if (threshold != null && score >= threshold) {
      s.classList.add('earned');
    } else {
      s.classList.remove('earned');
    }
  });
}

function render(motion = {}) {
  board.innerHTML = '';
  board.classList.toggle('preview-mode', previewMode);
  deck.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.setProperty('--deal-delay', `${i * 45}ms`);
    const isFlipped = previewMode || c.matched || flippedCards.includes(i);
    if (c.matched) el.classList.add('matched');
    if (isFlipped) {
      el.classList.add('flipped');
      setCardFace(el, c);
    } else {
      el.classList.add('card-back');
      applyCardBackStyle(el);
    }
    if (motion.deal) el.classList.add('deal-in');
    if (motion.previewEnding) el.classList.add('flip-down');
    if (motion.flip?.includes(i)) el.classList.add('flip-in');
    if (motion.match?.includes(i)) el.classList.add('match-pop');
    if (motion.mismatch?.includes(i)) el.classList.add('mismatch-shake');
    el.setAttribute('role', 'button');
    el.tabIndex = c.matched || previewMode ? -1 : 0;
    el.setAttribute('aria-label', isFlipped ? String(c.content) : `Face-down card ${i + 1}`);
    el.addEventListener('click', () => onCardClick(i));
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onCardClick(i);
    });
    board.appendChild(el);
  });
  
  updateHUD();
  updateProgressBar();
}

function updateHUD() {
  timerEl.textContent = timeLeft;
  if (timerTextEl) {
    timerTextEl.textContent = previewMode ? 'LOOK' : timeLeft;
  }
  if (timerDisplayEl) {
    timerDisplayEl.classList.toggle('is-preview', previewMode);
    timerDisplayEl.classList.toggle('timer-danger', !previewMode && timeLeft > 0 && timeLeft <= 10);
  }
  if (timerUnitEl) timerUnitEl.hidden = previewMode;
  if (pairsFoundEl) pairsFoundEl.textContent = matchedCount + '/' + totalPairs;
  if (scoreEl) scoreEl.textContent = score;
}

function matchPoints() {
  return BASE_SCORE * Math.min(combo, MAX_COMBO_MULTIPLIER);
}

function starCount() {
  if (score >= STAR_THRESHOLDS[2]) return 3;
  if (score >= STAR_THRESHOLDS[1]) return 2;
  if (score >= STAR_THRESHOLDS[0]) return 1;
  return 0;
}

function starRating() {
  const filled = starCount();
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

function celebrateNewStars(previousCount) {
  const currentCount = starCount();
  if (currentCount <= previousCount) return;
  for (let index = previousCount; index < currentCount; index++) {
    const star = document.querySelector(`.star-milestone[data-milestone="${index + 1}"]`);
    setTimeout(() => replayAnimation(star, 'just-earned'), (index - previousCount) * 140);
  }
  Sfx.play('star');
}

function onCardClick(i) {
  if (gameOver || lockBoard || previewMode) return;
  const card = deck[i];
  if (card.matched || flippedCards.includes(i)) return;

  flippedCards.push(i);
  Sfx.play('flip');
  render({ flip: [i] });

  if (flippedCards.length === 2) {
    const [a, b] = flippedCards;
    lockBoard = true;
    if (resolveTimeoutId) clearTimeout(resolveTimeoutId);
    resolveTimeoutId = setTimeout(() => {
      resolveTimeoutId = null;
      if (deck[a].pairId === deck[b].pairId) {
        const previousStars = starCount();
        deck[a].matched = true;
        deck[b].matched = true;
        matchedCount++;
        combo++;
        const points = matchPoints();
        score += points;
        flippedCards = [];
        render({ match: [a, b] });
        replayAnimation(scoreEl, 'hud-pop');
        replayAnimation(pairsFoundEl, 'hud-pop');
        celebrateNewStars(previousStars);
        Sfx.play('match');
        announce(`Match! ${points} points. ${matchedCount} of ${totalPairs} pairs found.`);
        if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
        if (matchedCount === totalPairs) {
          resolveTimeoutId = setTimeout(() => {
            resolveTimeoutId = null;
            onFullClear();
          }, 480);
        } else {
          lockBoard = false;
        }
      } else {
        combo = 0;
        render({ mismatch: [a, b] });
        Sfx.play('mismatch');
        announce('Not a match. Try again.');
        resolveTimeoutId = setTimeout(() => {
          resolveTimeoutId = null;
          flippedCards = [];
          lockBoard = false;
          render({ previewEnding: true });
          if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
        }, 680);
      }
    }, 280);
  }
}

function hideLevelComplete() {
  if (levelCompleteEl) levelCompleteEl.classList.add('hidden');
}

function beginPreview(onComplete) {
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
  previewMode = true;
  lockBoard = true;
  render({ deal: true });
  Sfx.play('ready');
  announce('Memorize the cards.');
  previewTimeoutId = setTimeout(() => {
    previewMode = false;
    lockBoard = false;
    previewTimeoutId = null;
    render({ previewEnding: true });
    announce('Go! Find the matching pairs.');
    if (onComplete) onComplete();
    if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
  }, PREVIEW_TIME * 1000);
}

function refreshBoard() {
  flippedCards = [];
  matchedCount = 0;
  combo = 0;
  const resumeTimer = !gameOver;
  if (resumeTimer) clearInterval(timerId);
  pickRoundPairs();
  buildDeck();
  beginPreview(() => {
    if (resumeTimer) timerId = setInterval(tick, 1000);
  });
}

function onFullClear() {
  const previousStars = starCount();
  score += FULL_CLEAR_BONUS;
  lockBoard = true;
  updateHUD();
  updateProgressBar();
  celebrateNewStars(previousStars);
  replayAnimation(board, 'board-clear');
  replayAnimation(scoreEl, 'hud-pop');
  Sfx.play('clear');
  announce(`Board cleared! ${FULL_CLEAR_BONUS} bonus points.`);
  setTimeout(() => {
    refreshBoard();
  }, 1050);
}

function endGame() {
  gameOver = true;
  clearInterval(timerId);
  if (resolveTimeoutId) clearTimeout(resolveTimeoutId);
  resolveTimeoutId = null;
  updateHUD();
  updateProgressBar();
  const earnedStars = Math.max(1, starCount());
  Sfx.play('gameover');
  announce(`Time is up. Final score ${score}.`);
  if (typeof GameResult !== 'undefined') {
    GameResult.show({ stars: earnedStars, score, onNext: startGame });
  } else {
    if (completeStarsEl) completeStarsEl.textContent = starRating();
    if (completeScoreEl) completeScoreEl.textContent = score;
    if (levelCompleteEl) levelCompleteEl.classList.remove('hidden');
  }
  if (typeof GameScoreReporter !== 'undefined') {
    GameScoreReporter.reportGameScore('cardgame', score, {
      stars: earnedStars,
      matchedCount,
      timeLeft,
    });
  }
  if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
}

function tick() {
  if (gameOver) return;
  timeLeft--;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame();
  }
  updateHUD();
  if (timeLeft > 0 && timeLeft <= 10) {
    replayAnimation(timerDisplayEl, 'timer-tick');
    Sfx.play('warning');
  }
}

function startGame() {
  clearInterval(timerId);
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
  if (resolveTimeoutId) clearTimeout(resolveTimeoutId);
  resolveTimeoutId = null;
  flippedCards = [];
  matchedCount = 0;
  score = 0;
  combo = 0;
  timeLeft = ROUND_TIME;
  gameOver = false;
  previewMode = false;
  hideLevelComplete();
  pickRoundPairs();
  buildDeck();
  beginPreview(() => {
    timerId = setInterval(tick, 1000);
  });
  fitGameToScreen();
  if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
}

window.getGameState = function() {
  return {
    deck: deck.map(c => ({ pairId: c.pairId, type: c.type, content: c.content, matched: c.matched })),
    cardBackAssignments: cardBackAssignments.slice(),
    flippedCards: flippedCards.slice(),
    matchedCount, score, combo, timeLeft, gameOver
  };
};

window.setGameState = function(state) {
  if (!state || !state.deck) { startGame(); return; }
  clearInterval(timerId);
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
  if (resolveTimeoutId) clearTimeout(resolveTimeoutId);
  resolveTimeoutId = null;
  previewMode = false;
  previewTimeoutId = null;
  deck = state.deck.map(c => ({ pairId: c.pairId, type: c.type, content: c.content, matched: c.matched }));
  cardBackAssignments = state.cardBackAssignments || CARD_BACK_IMAGES_UPDATED.slice(0, deck.length);
  flippedCards = state.flippedCards || [];
  matchedCount = state.matchedCount || 0;
  score = state.score || 0;
  combo = state.combo || 0;
  timeLeft = typeof state.timeLeft === 'number' ? state.timeLeft : ROUND_TIME;
  gameOver = !!state.gameOver;
  lockBoard = false;
  render();
  fitGameToScreen();
  if (!gameOver) timerId = setInterval(tick, 1000);
};

window.onCardImageUpdated = function(slotKey) {
  if (typeof CardImageConfig !== 'undefined') {
    CardImageConfig.applySlot(slotKey);
  }
};

function onKeyDown(e) {
  if (e.key !== 'q' && e.key !== 'Q') return;
  if (gameOver) return;
  if (levelCompleteEl && !levelCompleteEl.classList.contains('hidden')) return;
  e.preventDefault();
  endGame();
}

async function initGame() {
  Sfx.preload();
  if (typeof VocaConfig !== 'undefined') {
    await VocaConfig.loadFromServer();
    pickRoundPairs();
    if (VocaConfig.hasImageItems()) {
      await VocaConfig.preloadImages(roundPairs.filter((pair) => pair.img).map((pair) => ({
        imageUrl: pair.img,
        word: pair.word,
      })));
    }
  }
  if (typeof CardImageConfig !== 'undefined') {
    await CardImageConfig.applyAll();
    await GameLoadingScreen.preloadImageConfig(CardImageConfig);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', Sfx.unlock, { once: true });
  if (soundToggleEl) {
    soundToggleEl.addEventListener('click', () => {
      Sfx.toggle();
      syncSoundButton();
    });
  }
  syncSoundButton();
  startGame();
  await GameLoadingScreen.hide();
}

initGame();
