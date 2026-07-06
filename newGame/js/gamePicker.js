/* ===========================================================
   Game picker — switch between games from in-game UI
   =========================================================== */

(() => {
  "use strict";

  const GAMES = [
    { id: "wordwhack", label: "Word-Whack Blitz", sub: "Complete the sentence" },
    { id: "cardgame", label: "Picture-Word Memory Match", sub: "Card Game" },
    { id: "findgame", label: "Find the Object", sub: "Tap to find" },
  ];

  function getCurrentGameId() {
    const path = window.location.pathname.replace(/\\/g, "/").toLowerCase();
    if (path.includes("/findgame")) return "findgame";
    if (path.includes("/cardgame")) return "cardgame";
    return "wordwhack";
  }

  function hrefFor(gameId) {
    const current = getCurrentGameId();
    const roots = {
      wordwhack: current === "wordwhack" ? "index.html" : "../index.html",
      cardgame: current === "cardgame" ? "index.html" : current === "findgame" ? "../CardGame/index.html" : "CardGame/index.html",
      findgame: current === "findgame" ? "index.html" : current === "cardgame" ? "../FindGame/index.html" : "FindGame/index.html",
    };
    return roots[gameId] || "index.html";
  }

  function init() {
    const current = getCurrentGameId();
    const theme = current === "cardgame" ? "cardgame" : current === "findgame" ? "findgame" : "wordwhack";

    const root = document.createElement("div");
    root.className = `game-picker game-picker--${theme}`;
    root.innerHTML = `
      <button type="button" class="game-picker-btn" aria-haspopup="dialog" aria-expanded="false">
        Games
      </button>
      <div class="game-picker-backdrop hidden" hidden></div>
      <div class="game-picker-panel hidden" role="dialog" aria-modal="true" aria-label="Choose a game" hidden>
        <div class="game-picker-panel-inner">
          <h2 class="game-picker-heading">Choose a game</h2>
          <ul class="game-picker-list"></ul>
          <button type="button" class="game-picker-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const btn = root.querySelector(".game-picker-btn");
    const backdrop = root.querySelector(".game-picker-backdrop");
    const panel = root.querySelector(".game-picker-panel");
    const list = root.querySelector(".game-picker-list");
    const closeBtn = root.querySelector(".game-picker-close");

    GAMES.forEach((game) => {
      const li = document.createElement("li");

      if (game.id === current) {
        const currentEl = document.createElement("span");
        currentEl.className = "game-picker-item game-picker-item--current";
        currentEl.setAttribute("aria-current", "page");
        currentEl.innerHTML = `
          <span class="game-picker-item-label">${game.label}</span>
          <span class="game-picker-item-sub">${game.sub}</span>
          <span class="game-picker-item-badge">Playing</span>
        `;
        li.appendChild(currentEl);
      } else {
        const link = document.createElement("a");
        link.className = "game-picker-item";
        link.href = hrefFor(game.id);
        link.innerHTML = `
          <span class="game-picker-item-label">${game.label}</span>
          <span class="game-picker-item-sub">${game.sub}</span>
        `;
        li.appendChild(link);
      }

      list.appendChild(li);
    });

    function setOpen(open) {
      backdrop.hidden = !open;
      panel.hidden = !open;
      backdrop.classList.toggle("hidden", !open);
      panel.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", () => setOpen(panel.hidden));
    backdrop.addEventListener("click", () => setOpen(false));
    closeBtn.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) setOpen(false);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
