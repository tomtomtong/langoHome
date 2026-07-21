(() => {
  document.documentElement.classList.add('lango-motion-booting');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isTopLevelPage = window.self === window.top;
  let navigationStarted = false;

  function playTransition(options) {
    const onCovered = options?.onCovered;
    if (typeof onCovered === 'function') {
      return Promise.resolve(onCovered());
    }
    return Promise.resolve();
  }

  function navigateWithTransition(destination) {
    if (navigationStarted) return Promise.resolve();
    navigationStarted = true;
    const targetUrl = new URL(destination, window.location.href).href;
    window.location.assign(targetUrl);
    return Promise.resolve();
  }

  function getInternalNavigation(anchor) {
    if (!anchor?.href || anchor.hasAttribute('download')) return null;
    if (anchor.dataset.noPageTransition !== undefined) return null;

    const target = (anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return null;

    const url = new URL(anchor.href, window.location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) return null;
    if (url.href === window.location.href) return null;
    if (
      url.pathname === window.location.pathname
      && url.search === window.location.search
      && url.hash
    ) return null;
    return url.href;
  }

  document.addEventListener('click', (event) => {
    if (!isTopLevelPage) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target.closest?.('a');
    const destination = getInternalNavigation(anchor);
    if (!destination) return;

    event.preventDefault();
    navigateWithTransition(destination);
  }, true);

  window.LangoPageTransition = Object.freeze({
    play: playTransition,
    navigate: navigateWithTransition,
  });

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
