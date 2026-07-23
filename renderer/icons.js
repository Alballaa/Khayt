/* ============================================================
   Khayt line icons — one shared, quiet vocabulary
   ============================================================

   The redesign's rule is quiet by default, colour only for conditions. A
   toolbar of 📅📆📋🤖🖥 breaks it twice: the glyphs shout, and they render in
   whatever colour and metrics the OS emoji font decides, which is neither the
   app's ink nor consistent across Windows/macOS/Linux.

   These are single-stroke 24-grid paths drawn in currentColor, so they inherit
   the button's text colour and sit on the baseline like text. Same shape the
   workbench theme already used inline (ICON/svg there); promoted here so the
   shared chrome and every theme can draw from one set instead of each keeping
   its own.

   Add a glyph by name; never inline an emoji in markup that this could cover.
   ============================================================ */
(function (global) {

  const PATHS = {
    // calendar / schedule
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    // timeline / schedule-by-time
    schedule: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    // clipboard / batch planner / report
    clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12h6M9 16h4"/>',
    // wand / auto-suggest (was 🤖 / 🪄)
    wand: '<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.4 3.6l-1.4 1.4M13 8l-8 8-2-2 8-8zM19.4 4.6L18 6"/>',
    // monitor / kiosk
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    // printer
    printer: '<path d="M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1M6 14h12v7H6z"/>',
    // spool / filament
    spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6"/>',
    // play / start shift
    play: '<path d="M6 3l14 9-14 9V3z"/>',
  };

  /**
   * @param {string} name  one of PATHS
   * @param {number} [size=15]
   * @returns {string} inline SVG, or '' for an unknown name (never a broken tag)
   */
  function icon(name, size) {
    const d = PATHS[name];
    if (!d) return '';
    const s = (+size > 0) ? +size : 15;
    return `<svg class="khayt-ico" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"`
      + ` stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`
      + ` aria-hidden="true" focusable="false">${d}</svg>`;
  }

  /**
   * Fill every [data-khayt-icon] element under `root` with its glyph. Lets
   * static markup (the queue toolbar) declare an icon by name and stay one
   * source of truth with the dynamic surfaces. Idempotent: a hydrated element
   * carries data-icon-done so a re-render never double-fills it.
   * @param {ParentNode} [root=document]
   */
  function hydrateIcons(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-khayt-icon]:not([data-icon-done])').forEach((el) => {
      const svg = icon(el.getAttribute('data-khayt-icon'), +el.getAttribute('data-icon-size') || 15);
      if (!svg) return;
      el.insertAdjacentHTML('afterbegin', svg);
      el.setAttribute('data-icon-done', '1');
    });
  }

  const api = { icon, hydrateIcons, PATHS };
  Object.assign(global, { khaytIcon: icon });
  global.KhaytIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof globalThis !== 'undefined' ? globalThis : window);
