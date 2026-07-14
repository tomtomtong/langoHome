(function () {
  async function reportGameScore(gameId, score, details) {
    try {
      const res = await fetch('/api/game-plays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          gameId,
          score: Math.max(0, Math.round(Number(score) || 0)),
          details: details && typeof details === 'object' ? details : null,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[game-score] report failed:', e);
      return null;
    }
  }

  window.GameScoreReporter = { reportGameScore };
})();
