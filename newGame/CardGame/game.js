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

const board = document.getElementById('board');
const timerEl = document.getElementById('timer');
const timerTextEl = document.getElementById('timer-text');
const pairsFoundEl = document.getElementById('pairs-found');
const scoreEl = document.getElementById('score-text');
const levelCompleteEl = document.getElementById('level-complete');
const completeStarsEl = document.getElementById('complete-stars');
const completeScoreEl = document.getElementById('complete-score');

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
  return typeof CardImageConfig !== 'undefined'
    ? CardImageConfig.getUrl('card_cardBack')
    : 'assets/images/card-back.svg';
}

function cardBackBackgroundSize(scale) {
  if (scale === 1) return 'cover';
  const pct = `${Math.round(100 * scale)}%`;
  return `${pct} ${pct}`;
}

function applyCardBackStyle(el) {
  const url = getCardBackUrl();
  const scale = typeof CardImageConfig !== 'undefined'
    ? CardImageConfig.getScale('card_cardBack')
    : 1;
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

function render() {
  board.innerHTML = '';
  board.classList.toggle('preview-mode', previewMode);
  deck.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    const isFlipped = previewMode || c.matched || flippedCards.includes(i);
    if (c.matched) el.classList.add('matched');
    if (isFlipped) {
      el.classList.add('flipped');
      setCardFace(el, c);
    } else {
      el.classList.add('card-back');
      applyCardBackStyle(el);
    }
    el.addEventListener('click', () => onCardClick(i));
    board.appendChild(el);
  });
  
  updateHUD();
  updateProgressBar();
}

function updateHUD() {
  timerEl.textContent = timeLeft;
  if (timerTextEl) {
    timerTextEl.textContent = previewMode ? 'Remember!' : timeLeft;
  }
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

function onCardClick(i) {
  if (gameOver || lockBoard || previewMode) return;
  const card = deck[i];
  if (card.matched || flippedCards.includes(i)) return;

  flippedCards.push(i);
  render();

  if (flippedCards.length === 2) {
    const [a, b] = flippedCards;
    if (deck[a].pairId === deck[b].pairId) {
      deck[a].matched = true;
      deck[b].matched = true;
      matchedCount++;
      combo++;
      score += matchPoints();
      flippedCards = [];
      render();
      if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
      if (matchedCount === totalPairs) onFullClear();
    } else {
      lockBoard = true;
      combo = 0;
      setTimeout(() => {
        flippedCards = [];
        lockBoard = false;
        render();
        if (typeof window.__bgaMarkDirty === 'function') window.__bgaMarkDirty();
      }, 1000);
    }
  }
}

function hideLevelComplete() {
  if (levelCompleteEl) levelCompleteEl.classList.add('hidden');
}

function beginPreview(onComplete) {
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
  previewMode = true;
  lockBoard = true;
  render();
  previewTimeoutId = setTimeout(() => {
    previewMode = false;
    lockBoard = false;
    previewTimeoutId = null;
    render();
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
  score += FULL_CLEAR_BONUS;
  lockBoard = true;
  updateHUD();
  updateProgressBar();
  setTimeout(() => {
    refreshBoard();
  }, 800);
}

function endGame() {
  gameOver = true;
  clearInterval(timerId);
  updateHUD();
  updateProgressBar();
  const earnedStars = Math.max(1, starCount());
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
}

function startGame() {
  clearInterval(timerId);
  if (previewTimeoutId) clearTimeout(previewTimeoutId);
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
  if (slotKey === 'card_cardBack' || slotKey === '*') {
    render();
    return;
  }
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
  startGame();
  await GameLoadingScreen.hide();
}

initGame();
