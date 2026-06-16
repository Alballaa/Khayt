/**
 * Atelier shell — floating sidebar layout (CSS-driven; expand + icon hydration).
 */
(function (global) {
  function applyAtelierShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    global.KhaytIcon?.hydrateHandoff?.();
  }

  function teardownAtelierShell() {}

  global.KhaytAtelierShell = {
    applyAtelierShell,
    teardownAtelierShell,
  };
})(typeof window !== 'undefined' ? window : globalThis);
