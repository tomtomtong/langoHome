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
      <div class="lango-result__dialog">
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
      const star = document.createElement("img");
      star.className = "lango-result__star";
      star.alt = "";
      star.src = asset(index < count ? "perfect-star.png" : "nice-star.png");
      row.appendChild(star);
    }
  }

  function show({ stars = 1, score = 0, onNext } = {}) {
    ensureOverlay();
    const count = clampStars(stars);
    const tier = TIERS[count];
    overlay.dataset.tier = tier.id;
    overlay.querySelector(".lango-result__title").src = asset(tier.title);
    overlay.querySelector(".lango-result__title").alt = tier.label;
    overlay.querySelector("#lango-result-title").textContent = `${tier.label} result`;
    overlay.querySelector(".lango-result__score-text").textContent = `Score: ${Math.max(0, Math.round(Number(score) || 0))}`;
    renderStars(count);
    nextHandler = onNext;
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.querySelector(".lango-result__next").focus());
  }

  function hide() {
    if (!overlay) return;
    overlay.hidden = true;
    nextHandler = null;
  }

  window.GameResult = Object.freeze({ show, hide, clampStars });
})();
