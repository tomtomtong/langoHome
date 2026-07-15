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
  let nextHandler = null;
  let scoreFrame = 0;
  let scoreDelay = 0;

  function asset(name) {
    return new URL(name, assetBase).href;
  }

  function ensureStylesheet() {
    if (document.querySelector(`link[href="${stylesheetUrl}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    document.head.appendChild(link);
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
        <button class="lango-result__next" type="button" aria-label="Next">
          <img class="lango-result__next-image" alt="Next" src="${asset("score-board.png")}">
        </button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".lango-result__next").addEventListener("click", () => {
      const handler = nextHandler;
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
    const colors = ["#ffd83d", "#ff6b6b", "#58d7ff", "#77df70", "#d58cff", "#ff9a3d"];
    const pieceCount = count === 3 ? 34 : count === 2 ? 24 : 16;
    celebration.innerHTML = "";
    for (let index = 0; index < pieceCount; index += 1) {
      const piece = document.createElement("i");
      piece.className = "lango-result__confetti";
      piece.style.setProperty("--x", `${3 + ((index * 37) % 94)}%`);
      piece.style.setProperty("--delay", `${(index % 9) * 0.07}s`);
      piece.style.setProperty("--duration", `${1.7 + (index % 5) * 0.16}s`);
      piece.style.setProperty("--drift", `${((index * 29) % 160) - 80}px`);
      piece.style.setProperty("--spin", `${360 + (index % 4) * 180}deg`);
      piece.style.setProperty("--color", colors[index % colors.length]);
      celebration.appendChild(piece);
    }
    for (let index = 0; index < 8; index += 1) {
      const sparkle = document.createElement("i");
      sparkle.className = "lango-result__sparkle";
      sparkle.style.setProperty("--angle", `${index * 45}deg`);
      sparkle.style.setProperty("--spark-delay", `${0.38 + index * 0.045}s`);
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

  function show({ stars = 1, score = 0, onNext } = {}) {
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
    nextHandler = onNext;
    overlay.hidden = false;
    overlay.classList.remove("is-active");
    requestAnimationFrame(() => {
      overlay.classList.add("is-active");
      overlay.querySelector(".lango-result__next").focus({ preventScroll: true });
    });
  }

  function hide() {
    if (!overlay) return;
    cancelAnimationFrame(scoreFrame);
    clearTimeout(scoreDelay);
    overlay.classList.remove("is-active");
    overlay.hidden = true;
    nextHandler = null;
  }

  window.GameResult = Object.freeze({ show, hide, clampStars });
})();
