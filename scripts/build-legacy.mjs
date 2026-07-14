import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_DIR = join(ROOT, 'assets', 'legacy');

const CHROME_58_TARGET = ['chrome58'];
const WEBVIEW_COMPAT = '<script src="/assets/webview-compat.js"></script><link rel="stylesheet" href="/assets/webview-compat.css">';

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function injectCompat(html) {
  if (html.includes('webview-compat.js')) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>${WEBVIEW_COMPAT}`);
}

function extractRegex(html, pattern, label) {
  const match = html.match(pattern);
  if (!match || !match[1]) throw new Error(`Could not extract: ${label}`);
  return match[1];
}

async function bundleScript(contents, outfile) {
  await esbuild.build({
    stdin: {
      contents,
      loader: 'js',
      resolveDir: ROOT,
    },
    bundle: true,
    format: 'iife',
    target: CHROME_58_TARGET,
    outfile,
    logLevel: 'info',
  });
}

async function buildIndexLegacy() {
  const htmlPath = join(ROOT, 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  const sfxScript = extractRegex(
    html,
    /window\.LangoSfx = \(\(\) => \{([\s\S]*?)\}\)\(\);/,
    'LangoSfx',
  );
  const reactScript = extractRegex(
    html,
    /<script>\s*\(\(\) => \{\s*const e = React\.createElement;([\s\S]*?)\}\)\(\);\s*<\/script>/,
    'React UI',
  );
  const moduleScript = extractRegex(
    html,
    /<script type="module">\s*([\s\S]*?)\s*<\/script>\s*<\/body>/,
    'app module',
  );

  const uiSource = `window.LangoSfx = (() => {${sfxScript}})();\n(() => { const e = React.createElement;${reactScript}})();`;
  const appSource = moduleScript.replace(
    'from "/visme/avatar.js"',
    'from "./visme/avatar-legacy.js"',
  );

  await bundleScript(uiSource, join(LEGACY_DIR, 'index-ui.bundle.js'));
  await bundleScript(appSource, join(LEGACY_DIR, 'index-app.bundle.js'));

  let legacyHtml = html;
  legacyHtml = legacyHtml.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '');
  legacyHtml = legacyHtml.replace(
    /<link rel="preload" href="\/visme\/Tommyv4\.vrm"[^>]*>\s*/i,
    '',
  );
  legacyHtml = legacyHtml.replace(
    /<script>\s*\/\/ Lightweight UI sound layer\.[\s\S]*?<\/script>\s*<script>\s*\(\(\) => \{\s*const e = React\.createElement;[\s\S]*?<\/script>/,
    '<script src="/assets/legacy/index-ui.bundle.js"></script>',
  );
  legacyHtml = legacyHtml.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    '<script src="/assets/legacy/index-app.bundle.js"></script>',
  );
  legacyHtml = legacyHtml.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/react@18[^>]*><\/script>\s*/i,
    '<script src="https://unpkg.com/react@16.14.0/umd/react.production.min.js" crossorigin></script>\n  ',
  );
  legacyHtml = legacyHtml.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/react-dom@18[^>]*><\/script>\s*/i,
    '<script src="https://unpkg.com/react-dom@16.14.0/umd/react-dom.production.min.js" crossorigin></script>\n  <script>window.__LANGO_INSTALL_REACT_SHIM__ && window.__LANGO_INSTALL_REACT_SHIM__();</script>\n  ',
  );
  legacyHtml = legacyHtml.replace(
    /<script src="https:\/\/unpkg\.com\/react@16[^>]*><\/script>\s*(<script src="https:\/\/unpkg\.com\/react-dom@16[^>]*><\/script>\s*<script>window\.__LANGO_INSTALL_REACT_SHIM__[\s\S]*?<\/script>\s*)?(?=<script src="\/assets\/legacy\/index-ui\.bundle\.js">)/,
    '<script src="https://unpkg.com/react@16.14.0/umd/react.production.min.js" crossorigin></script>\n  <script src="https://unpkg.com/react-dom@16.14.0/umd/react-dom.production.min.js" crossorigin></script>\n  <script>window.__LANGO_INSTALL_REACT_SHIM__ && window.__LANGO_INSTALL_REACT_SHIM__();</script>\n  ',
  );

  if (legacyHtml.includes('type="module"')) {
    throw new Error('index.legacy.html still contains ES module scripts');
  }

  writeFileSync(join(ROOT, 'index.legacy.html'), injectCompat(legacyHtml));
}

async function buildMapLegacy() {
  const htmlPath = join(ROOT, 'map', 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  const mapScript = extractRegex(
    html,
    /<script>\s*\(\(\) => \{\s*const e = React\.createElement;([\s\S]*?)\}\)\(\);\s*<\/script>/,
    'map page',
  );

  const source = `(() => { const e = React.createElement;${mapScript}})();`;
  await bundleScript(source, join(LEGACY_DIR, 'map.bundle.js'));

  let legacyHtml = html;
  legacyHtml = legacyHtml.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/react@18[^>]*><\/script>\s*/i,
    '<script src="https://unpkg.com/react@16.14.0/umd/react.production.min.js" crossorigin></script>\n  ',
  );
  legacyHtml = legacyHtml.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/react-dom@18[^>]*><\/script>\s*/i,
    '<script src="https://unpkg.com/react-dom@16.14.0/umd/react-dom.production.min.js" crossorigin></script>\n  <script>window.__LANGO_INSTALL_REACT_SHIM__ && window.__LANGO_INSTALL_REACT_SHIM__();</script>\n  ',
  );
  legacyHtml = legacyHtml.replace(
    /<script>\s*\(\(\) => \{\s*const e = React\.createElement;[\s\S]*?<\/script>/,
    '<script src="/assets/legacy/map.bundle.js"></script>',
  );

  writeFileSync(join(ROOT, 'map', 'index.legacy.html'), injectCompat(legacyHtml));
}

async function buildLoginLegacy() {
  const htmlPath = join(ROOT, 'login.html');
  const html = readFileSync(htmlPath, 'utf8');
  const script = extractRegex(html, /<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/, 'login');
  await bundleScript(script, join(LEGACY_DIR, 'login.bundle.js'));

  let legacyHtml = html;
  legacyHtml = legacyHtml.replace(
    /<script>[\s\S]*?<\/script>\s*<\/body>/,
    '<script src="/assets/legacy/login.bundle.js"></script>\n</body>',
  );
  writeFileSync(join(ROOT, 'login.legacy.html'), injectCompat(legacyHtml));
}

ensureDir(LEGACY_DIR);
await buildIndexLegacy();
await buildMapLegacy();
await buildLoginLegacy();
console.log('Legacy WebView bundles written to assets/legacy/');
