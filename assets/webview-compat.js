(function () {
  var ua = navigator.userAgent || '';
  var chromeMatch = ua.match(/Chrom(?:e|ium)\/(\d+)/);
  var chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;
  var isMediaTek = /mediatek\.webview/i.test(ua);
  var isLegacy = isMediaTek || (chromeVersion > 0 && chromeVersion < 64);

  try {
    if (/[?&]legacy=1(?:&|$)/.test(location.search)) isLegacy = true;
  } catch (e) {}

  window.__LANGO_LEGACY_WEBVIEW__ = isLegacy;

  if (!isLegacy) return;

  document.documentElement.className += ' legacy-webview';

  window.__LANGO_INSTALL_REACT_SHIM__ = function () {
    if (!window.ReactDOM || window.ReactDOM.__langoCreateRootShim) return;
    var render = ReactDOM.render;
    var unmount = ReactDOM.unmountComponentAtNode;
    ReactDOM.createRoot = function (container) {
      return {
        render: function (element) {
          render(element, container);
          return this;
        },
        unmount: function () {
          if (unmount) unmount(container);
        },
      };
    };
    ReactDOM.__langoCreateRootShim = true;
  };

  function removeHeavyPreloads() {
    var links = document.querySelectorAll('link[rel="preload"], link[rel="preconnect"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || '';
      if (/\.vrm|fonts\.googleapis|fonts\.gstatic/i.test(href)) {
        if (links[i].parentNode) links[i].parentNode.removeChild(links[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeHeavyPreloads, { once: true });
  } else {
    removeHeavyPreloads();
  }
})();
