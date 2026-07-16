/* ===========================================================
   Shared sound settings popover
   Independent controls for sound effects and background music.
   =========================================================== */

(() => {
  "use strict";

  let menuIndex = 0;

  function initControl(root) {
    const trigger = root.querySelector("[data-game-audio-menu-button]");
    if (!trigger || !window.GameSfx || !window.GameBgm) return;

    const menuId = `game-audio-menu-${++menuIndex}`;
    const menu = document.createElement("div");
    menu.id = menuId;
    menu.className = "game-audio-menu";
    menu.hidden = true;
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "Sound settings");
    menu.innerHTML = `
      <div class="game-audio-menu__title">Sound</div>
      <button class="game-audio-option" type="button" role="switch" data-audio-kind="effects">
        <span class="game-audio-option__icon" aria-hidden="true">✨</span>
        <span class="game-audio-option__copy">
          <strong>Sound effects</strong>
          <small>Answers and rewards</small>
        </span>
        <span class="game-audio-option__state" aria-hidden="true"><i></i></span>
      </button>
      <button class="game-audio-option" type="button" role="switch" data-audio-kind="music">
        <span class="game-audio-option__icon" aria-hidden="true">🎵</span>
        <span class="game-audio-option__copy">
          <strong>Background music</strong>
          <small>Game theme</small>
        </span>
        <span class="game-audio-option__state" aria-hidden="true"><i></i></span>
      </button>`;
    root.appendChild(menu);

    const effectsToggle = menu.querySelector('[data-audio-kind="effects"]');
    const musicToggle = menu.querySelector('[data-audio-kind="music"]');
    trigger.setAttribute("aria-controls", menuId);
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    function sync() {
      const effectsOn = !window.GameSfx.isMuted();
      const musicOn = !window.GameBgm.isMuted();
      effectsToggle.setAttribute("aria-checked", effectsOn ? "true" : "false");
      musicToggle.setAttribute("aria-checked", musicOn ? "true" : "false");
      effectsToggle.dataset.enabled = effectsOn ? "true" : "false";
      musicToggle.dataset.enabled = musicOn ? "true" : "false";

      trigger.textContent = effectsOn && musicOn ? "🔊" : effectsOn || musicOn ? "🔉" : "🔇";
      const summary = `Music ${musicOn ? "on" : "off"}, effects ${effectsOn ? "on" : "off"}`;
      trigger.setAttribute("aria-label", `Sound settings. ${summary}`);
      trigger.title = `Sound settings — ${summary}`;
    }

    function setOpen(open, { returnFocus = false } = {}) {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      root.classList.toggle("is-open", open);
      if (open) effectsToggle.focus({ preventScroll: true });
      else if (returnFocus) trigger.focus({ preventScroll: true });
    }

    trigger.addEventListener("click", () => setOpen(menu.hidden));
    effectsToggle.addEventListener("click", () => {
      window.GameSfx.setMuted(!window.GameSfx.isMuted());
      sync();
    });
    musicToggle.addEventListener("click", () => {
      window.GameBgm.setMuted(!window.GameBgm.isMuted());
      sync();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.hidden && !root.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        setOpen(false, { returnFocus: true });
      }
    });

    sync();
  }

  function init() {
    document.querySelectorAll("[data-game-audio-menu]").forEach(initControl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
