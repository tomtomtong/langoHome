/* ===========================================================
   Word-Whack Blitz — require Day 1 daily reward unlock
   =========================================================== */

(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (params.get("preview") === "1" || params.get("embedded") === "1") return;

  const UNLOCKED_GAMES_KEY = "lango.systemUnlockedGames";

  function redirectHome() {
    const destination = "/?locked=wordwhack";
    if (window.LangoPageTransition?.navigate) {
      window.LangoPageTransition.navigate(destination);
    } else {
      window.location.replace(destination);
    }
  }

  function hasLocalUnlock() {
    try {
      const saved = JSON.parse(localStorage.getItem(UNLOCKED_GAMES_KEY) || "[]");
      return Array.isArray(saved) && saved.includes("wordwhack");
    } catch {
      return false;
    }
  }

  async function enforceUnlock() {
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) {
        if (!hasLocalUnlock()) redirectHome();
        return;
      }
      const me = await meRes.json();
      if (me.role !== "student") return;

      const res = await fetch("/api/check-in");
      if (!res.ok) {
        if (!hasLocalUnlock()) redirectHome();
        return;
      }
      const status = await res.json();
      const unlocked = Array.isArray(status.unlockedGames) ? status.unlockedGames : [];
      try {
        localStorage.setItem(UNLOCKED_GAMES_KEY, JSON.stringify(unlocked));
      } catch { /* ignore */ }
      if (!unlocked.includes("wordwhack")) redirectHome();
    } catch {
      if (!hasLocalUnlock()) redirectHome();
    }
  }

  enforceUnlock();
})();
