(() => {
  "use strict";

  const scriptUrl = document.currentScript?.src || location.href;
  const assetBase = new URL("results/", scriptUrl);
  const stylesheetUrl = new URL("game-result.css", scriptUrl).href;
  const TIERS = {
    1: { id: "nice", label: "Nice", title: "nice-title.png" },
    2: { id: "excellent", label: "Excellent", title: "excellent-title.png" },
    3: { id: "perfect", label: "Perfect", title: "perfect-title.png" },
  };

  let overlay = null;
  let playAgainHandler = null;
  let returnHandler = null;
  let scoreFrame = 0;
  let scoreDelay = 0;
  let celebrationAudio = null;

  function asset(name) {
    return new URL(name, assetBase).href;
  }

  function playCelebrationSfx(stars) {
    const count = clampStars(stars);
    if (window.GameSfx?.play) {
      try {
        window.GameSfx.unlock?.();
        window.GameSfx.play("star");
        window.GameSfx.play(count >= 3 ? "finish" : "clear", { volume: 0.55 });
        return;
      } catch {
        /* fall through to victory clip */
      }
    }
    try {
      if (celebrationAudio) {
        celebrationAudio.pause();
        celebrationAudio = null;
      }
      celebrationAudio = new Audio("/assets/sfx/victory.mp3");
      celebrationAudio.volume = count >= 3 ? 0.62 : 0.5;
      celebrationAudio.play().catch(() => {});
    } catch {
      /* Audio may be blocked until a gesture; ignore. */
    }
  }

  function ensureStylesheet() {
    if (document.querySelector(`link[href="${stylesheetUrl}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    document.head.appendChild(link);
  }

  function defaultReturn() {
    if (typeof window.returnToConversation === "function") {
      window.returnToConversation();
      return;
    }
    const url = "/?connect=1";
    if (window.LangoPageTransition?.navigate) {
      window.LangoPageTransition.navigate(url);
    } else {
      window.location.assign(url);
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    ensureStylesheet();
    overlay = document.createElement("section");
    overlay.className = "lango-result";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "lango-result-title");
    overlay.innerHTML = `
      <div class="lango-result__celebration" aria-hidden="true"></div>
      <div class="lango-result__dialog">
        <div class="lango-result__glow" aria-hidden="true"></div>
        <img class="lango-result__panel" alt="" src="${asset("result-panel.png")}">
        <img class="lango-result__ribbon" alt="" src="${asset("result-board.png")}">
        <div class="lango-result__stars" aria-hidden="true"></div>
        <img class="lango-result__title" alt="">
        <h2 class="lango-result__sr-only" id="lango-result-title"></h2>
        <div class="lango-result__score">
          <img class="lango-result__score-plate" alt="" src="${asset("score-label.png")}">
          <span class="lango-result__score-text"></span>
        </div>
        <div class="lango-result__actions">
          <button class="lango-result__play-again" type="button">Play again</button>
          <button class="lango-result__return" type="button">Return</button>
        </div>
      </div>`;
    const gameFrame = document.getElementById("game");
    (gameFrame || document.body).appendChild(overlay);
    overlay.querySelector(".lango-result__play-again").addEventListener("click", () => {
      const handler = playAgainHandler;
      hide();
      if (typeof handler === "function") handler();
    });
    overlay.querySelector(".lango-result__return").addEventListener("click", () => {
      const handler = returnHandler || defaultReturn;
      hide();
      if (typeof handler === "function") handler();
    });
    return overlay;
  }

  function clampStars(stars) {
    const value = Math.round(Number(stars) || 1);
    return Math.max(1, Math.min(3, value));
  }

  function renderStars(count) {
    const row = overlay.querySelector(".lango-result__stars");
    row.innerHTML = "";
    for (let index = 0; index < 3; index += 1) {
      const slot = document.createElement("span");
      slot.className = "lango-result__star-slot";
      slot.style.setProperty("--star-delay", `${0.32 + index * 0.16}s`);
      const star = document.createElement("img");
      star.className = `lango-result__star ${index < count ? "is-filled" : "is-empty"}`;
      star.alt = "";
      star.src = asset(index < count ? "perfect-star.png" : "nice-star.png");
      slot.appendChild(star);
      row.appendChild(slot);
    }
  }

  function renderCelebration(count) {
    const celebration = overlay.querySelector(".lango-result__celebration");
    const colors = ["#ffd83d", "#ff6b6b", "#58d7ff", "#77df70", "#d58cff", "#ff9a3d", "#fff8a8", "#ff7ad9"];
    const pieceCount = count === 3 ? 48 : count === 2 ? 34 : 24;
    celebration.innerHTML = "";

    for (let index = 0; index < pieceCount; index += 1) {
      const piece = document.createElement("i");
      piece.className = "lango-result__confetti";
      piece.style.setProperty("--x", `${2 + ((index * 41) % 96)}%`);
      piece.style.setProperty("--delay", `${(index % 12) * 0.05}s`);
      piece.style.setProperty("--duration", `${1.55 + (index % 6) * 0.18}s`);
      piece.style.setProperty("--drift", `${((index * 31) % 200) - 100}px`);
      piece.style.setProperty("--spin", `${420 + (index % 5) * 180}deg`);
      piece.style.setProperty("--color", colors[index % colors.length]);
      if (index % 4 === 0) piece.classList.add("is-ribbon");
      celebration.appendChild(piece);
    }

    for (let burst = 0; burst < (count >= 3 ? 3 : 2); burst += 1) {
      const burstEl = document.createElement("span");
      burstEl.className = "lango-result__burst";
      burstEl.style.setProperty("--burst-x", `${28 + burst * 22}%`);
      burstEl.style.setProperty("--burst-y", `${18 + (burst % 2) * 16}%`);
      burstEl.style.setProperty("--burst-delay", `${0.12 + burst * 0.18}s`);
      celebration.appendChild(burstEl);
    }

    for (let index = 0; index < 12; index += 1) {
      const sparkle = document.createElement("i");
      sparkle.className = "lango-result__sparkle";
      sparkle.style.setProperty("--angle", `${index * 30}deg`);
      sparkle.style.setProperty("--spark-delay", `${0.28 + index * 0.04}s`);
      celebration.appendChild(sparkle);
    }
  }

  function animateScore(score) {
    const scoreEl = overlay.querySelector(".lango-result__score-text");
    const target = Math.max(0, Math.round(Number(score) || 0));
    cancelAnimationFrame(scoreFrame);
    clearTimeout(scoreDelay);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scoreEl.textContent = `Score: ${target}`;
      return;
    }
    scoreEl.textContent = "Score: 0";
    scoreDelay = window.setTimeout(() => {
      const startedAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / 720);
        const eased = 1 - Math.pow(1 - progress, 3);
        scoreEl.textContent = `Score: ${Math.round(target * eased)}`;
        if (progress < 1) scoreFrame = requestAnimationFrame(tick);
      };
      scoreFrame = requestAnimationFrame(tick);
    }, 560);
  }

  function show({
    stars = 1,
    score = 0,
    onPlayAgain,
    onReturn,
    onNext,
  } = {}) {
    ensureOverlay();
    const count = clampStars(stars);
    const tier = TIERS[count];
    overlay.dataset.tier = tier.id;
    overlay.querySelector(".lango-result__title").src = asset(tier.title);
    overlay.querySelector(".lango-result__title").alt = tier.label;
    overlay.querySelector("#lango-result-title").textContent = `${tier.label} result`;
    renderStars(count);
    renderCelebration(count);
    animateScore(score);
    playCelebrationSfx(count);
    playAgainHandler = typeof onPlayAgain === "function"
      ? onPlayAgain
      : typeof onNext === "function"
        ? onNext
        : null;
    returnHandler = typeof onReturn === "function" ? onReturn : defaultReturn;
    overlay.hidden = false;
    overlay.classList.remove("is-active");
    requestAnimationFrame(() => {
      overlay.classList.add("is-active");
      overlay.querySelector(".lango-result__play-again").focus({ preventScroll: true });
    });
  }

  function hide() {
    if (!overlay) return;
    cancelAnimationFrame(scoreFrame);
    clearTimeout(scoreDelay);
    if (celebrationAudio) {
      celebrationAudio.pause();
      celebrationAudio = null;
    }
    overlay.classList.remove("is-active");
    overlay.hidden = true;
    playAgainHandler = null;
    returnHandler = null;
  }

  window.GameResult = Object.freeze({ show, hide, clampStars });
})();
