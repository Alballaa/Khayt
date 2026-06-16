/**
 * Vitrine shell — ambient backdrop mount + glass sidebar layout.
 */
(function (global) {
  function ensureAmbientBg() {
    let el = document.getElementById('vitrineAmbientBg');
    if (el) return el;
    const app = document.querySelector('.khayt-app');
    if (!app) return null;
    el = document.createElement('div');
    el.id = 'vitrineAmbientBg';
    el.className = 'vitrine-ambient';
    el.setAttribute('aria-hidden', 'true');
    app.insertBefore(el, app.firstChild);
    return el;
  }

  function removeAmbientBg() {
    document.getElementById('vitrineAmbientBg')?.remove();
  }

  function applyVitrineShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    ensureAmbientBg();
    global.KhaytIcon?.hydrateHandoff?.();
  }

  function teardownVitrineShell() {
    removeAmbientBg();
  }

  global.KhaytVitrineShell = {
    applyVitrineShell,
    teardownVitrineShell,
    ensureAmbientBg,
    removeAmbientBg,
  };
})(typeof window !== 'undefined' ? window : globalThis);
