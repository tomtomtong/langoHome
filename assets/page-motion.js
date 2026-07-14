(() => {
  document.documentElement.classList.add('lango-motion-booting');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visualSelector = [
    'body > *',
    'main > *',
    'header > *',
    'footer > *',
    'nav > *',
    'section > *',
    'form > *',
    '[role="dialog"] > *',
    '.panel > *',
    '.card > *',
    '.scene > *',
  ].join(',');

  const excludedSelector = [
    'script',
    'style',
    'link',
    'meta',
    'source',
    'template',
    '[hidden]',
    '[aria-hidden="true"]',
    '#splash-screen',
    '#splash-screen *',
    '#game-loading',
    '#game-loading *',
  ].join(',');

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden';
  }

  function animatePageElements() {
    if (reducedMotion.matches) {
      document.documentElement.classList.remove('lango-motion-booting', 'lango-motion-revealing');
      return;
    }

    const candidates = [...new Set(document.querySelectorAll(visualSelector))]
      .filter((element) => !element.matches(excludedSelector))
      .filter((element) => !element.closest('[hidden], [aria-hidden="true"]'))
      .filter(isVisible);

    candidates.forEach((element, index) => {
      // Existing CSS/game animations keep ownership of their element.
      if (getComputedStyle(element).animationName !== 'none') return;
      const delay = Math.min(index * 22, 260);
      element.style.setProperty('--lango-enter-delay', `${delay}ms`);
      element.classList.add('lango-page-enter');
    });

    document.documentElement.classList.remove('lango-motion-booting', 'lango-motion-revealing');
  }

  function start() {
    // Two frames allow synchronous React roots and image-backed layouts to settle.
    requestAnimationFrame(() => requestAnimationFrame(animatePageElements));
  }

  function replayAfterReveal() {
    document.documentElement.classList.add('lango-motion-revealing');
    document.querySelectorAll('.lango-page-enter').forEach((element) => {
      element.classList.remove('lango-page-enter');
    });
    start();
  }

  window.addEventListener('lango:page-reveal', replayAfterReveal);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
