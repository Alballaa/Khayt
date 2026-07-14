'use strict';
/*
 * Bed Ready — bespoke line-symbol set (Cyanotype Draft redesign, Phase 2).
 *
 * Replaces emoji markers (a top "AI-generic" tell) with a coherent drafting-style icon family:
 * a 24-unit grid, 1.6 stroke, square caps + miter joins (technical, un-rounded), drawn in
 * currentColor so each icon inherits its context's ink/accent. Bed Ready-only; consumed by the
 * renderers via window.BedReadyIcons.get(name[, size]).
 */
(function () {
  // Path bodies on a 0..24 viewBox. Kept geometric so the set reads as one engineered family.
  var P = {
    // retarget — two swap arrows
    convert: '<path d="M4 8H17"/><path d="M14 5L17 8L14 11"/><path d="M20 16H7"/><path d="M10 13L7 16L10 19"/>',
    // colour mixing — two overlapping loops
    colour: '<circle cx="9.5" cy="10" r="5"/><circle cx="15" cy="14" r="5"/>',
    // job board — a short stack of rows
    queue: '<path d="M5 7H19"/><path d="M5 12H19"/><path d="M5 17H13"/>',
    // filament reel (side view) — two flanges + wound band
    spool: '<path d="M6 5V19"/><path d="M18 5V19"/><path d="M6 8H18"/><path d="M6 16H18"/>',
    // 3D model — isometric cube
    cube: '<path d="M12 3L20 7.5L12 12L4 7.5Z"/><path d="M4 7.5V16.5L12 21V12"/><path d="M20 7.5V16.5L12 21"/>',
    // cost per print — calculator
    calc: '<rect x="5" y="3" width="14" height="18"/><path d="M8 7H16"/><path d="M8 12H10"/><path d="M14 12H16"/><path d="M8 16H10"/><path d="M14 16H16"/>',
    // synced library — cloud
    cloud: '<path d="M8 18H16.5A3.5 3.5 0 0 0 17 11.1A5 5 0 0 0 7.3 10.2A4 4 0 0 0 8 18Z"/>',
    // slicer profile — extruder nozzle
    nozzle: '<path d="M8 4H16V10L12 20L8 10Z"/><path d="M8 10H16"/>',
    // filament care — drying droplet
    droplet: '<path d="M12 3C12 3 6 10.5 6 15A6 6 0 0 0 18 15C18 10.5 12 3 12 3Z"/>',
    // print bed / plate — isometric platform with a grid line
    plate: '<path d="M3 9L12 4L21 9L12 14Z"/><path d="M6 10.7V15L12 18.5L18 15V10.7"/>',
    // calibrate — target crosshair
    target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 1V5"/><path d="M12 19V23"/><path d="M1 12H5"/><path d="M19 12H23"/>',
    // open in slicer — printer
    printer: '<path d="M7 4H17V9H7Z"/><path d="M4 9H20V16H16"/><path d="M4 16H8"/><path d="M8 14H16V20H8Z"/>',
    // delete — waste bin
    trash: '<path d="M5 7H19"/><path d="M9 7V4H15V7"/><path d="M7 7L8 20H16L17 7"/><path d="M10 11V16"/><path d="M14 11V16"/>',
    // folder tag — drafting folder
    folder: '<path d="M4 6H10L12 8H20V18H4Z"/>',
    // gcode / document — sheet with folded corner
    doc: '<path d="M7 3H14L18 7V21H7Z"/><path d="M14 3V7H18"/><path d="M10 12H15"/><path d="M10 16H15"/>',
    // print time — clock
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7V12L15 15"/>',
    // fallback
    dot: '<circle cx="12" cy="12" r="3"/>',
  };

  function get(name, size) {
    var body = P[name] || P.dot;
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  window.BedReadyIcons = { get: get, has: function (n) { return Object.prototype.hasOwnProperty.call(P, n); } };
})();
