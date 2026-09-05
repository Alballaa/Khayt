'use strict';
/*
 * Multi-slicer model (3.1) — a maker often runs more than one slicer (PrusaSlicer for
 * FDM, a vendor slicer for a specific printer, etc.). Settings stores an array
 * `settings.slicers = [{ id, name, path, args }]` plus `settings.defaultSlicerId`.
 *
 * For backward compatibility the legacy single `settings.slicer = { path, args }` is
 * kept mirrored to the default slicer, so existing consumers (kanban print, machine
 * slice-and-print, quote slice) keep working unchanged. This module is the pure,
 * testable source of truth for reading that model. No DOM.
 */
(function (global) {
  // Guess a friendly name from an executable path (PrusaSlicer, OrcaSlicer, …).
  function slicerDisplayName(p) {
    if (!p) return '';
    const base = String(p).replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
    const stem = base.replace(/\.(app|exe|AppImage)$/i, '');
    const known = {
      prusaslicer: 'PrusaSlicer', prusagcodeviewer: 'PrusaSlicer',
      orcaslicer: 'OrcaSlicer', bambustudio: 'Bambu Studio', cura: 'Ultimaker Cura',
      ultimakercura: 'Ultimaker Cura', superslicer: 'SuperSlicer', slic3r: 'Slic3r',
      ideamaker: 'ideaMaker', simplify3d: 'Simplify3D',
      flashprint: 'FlashPrint', lychee: 'Lychee', lycheeslicer: 'Lychee', chitubox: 'CHITUBOX',
      chituboxpro: 'CHITUBOX Pro',
      // Orca/Bambu C++ forks — friendly names for the regex-caught apps.
      snapmakerorca: 'Snapmaker Orca', elegooslicer: 'Elegoo Slicer', elegoocura: 'ELEGOO Cura',
      qidistudio: 'QIDIStudio', crealityprint: 'Creality Print', sovolslicer: 'Sovol Slicer',
      anycubicslicernext: 'Anycubic Slicer Next', ankermakestudio: 'AnkerMake Studio',
      eufymakestudio: 'eufyMake Studio', icesl: 'IceSL', kisslicer: 'KISSlicer',
    };
    return known[stem.toLowerCase().replace(/[\s_.-]/g, '')] || stem;
  }

  /** Normalized list of configured slicers. Falls back to the legacy single slicer. */
  function listSlicers(settings) {
    const s = settings || {};
    if (Array.isArray(s.slicers) && s.slicers.length) {
      return s.slicers
        .filter((x) => x && x.path)
        .map((x, i) => ({
          id: x.id || ('sl' + i),
          name: (x.name && String(x.name).trim()) || slicerDisplayName(x.path) || ('Slicer ' + (i + 1)),
          path: x.path,
          args: x.args || '',
        }));
    }
    if (s.slicer && s.slicer.path) {
      return [{ id: 'default', name: slicerDisplayName(s.slicer.path) || 'Slicer', path: s.slicer.path, args: s.slicer.args || '' }];
    }
    return [];
  }

  /** The default slicer (by defaultSlicerId, else the first), or null if none. */
  function defaultSlicer(settings) {
    const list = listSlicers(settings);
    if (!list.length) return null;
    const id = settings && settings.defaultSlicerId;
    return list.find((x) => x.id === id) || list[0];
  }

  /** A configured slicer by id, or null. */
  function getSlicer(settings, id) {
    return listSlicers(settings).find((x) => x.id === id) || null;
  }

  // A configured slicer path (and its args template) is untrusted: settings.slicers[]
  // can arrive via a restored/synced snapshot, so a poisoned entry must never become
  // arbitrary code execution when the user clicks Slice / Test / Open-in-slicer. spawn
  // runs shell:false, but that only stops metacharacter injection into a shell — it does
  // nothing about the binary itself. A DENYLIST of interpreter names ("bash", "python", …)
  // cannot be complete: find, awk, gawk, xargs, gdb, make, tclsh, lua, busybox, git, expect
  // and dozens of other stock binaries each run an arbitrary command from their own args,
  // and none of them is a shell. GTFOBins is the full catalogue and it does not fit in a Set.
  //
  // So gate on a POSITIVE allowlist instead. The executable's name must look like a slicer,
  // matching the same family tokens used to auto-detect installed slicers (main.js
  // SLICER_APP_RE / lib slicerDisplayName). Every real slicer — PrusaSlicer, OrcaSlicer,
  // BambuStudio, UltiMaker-Cura, SuperSlicer, Slic3r, QIDIStudio, CHITUBOX, and the vendor
  // Orca forks — carries one of these tokens by construction; a living-off-the-land binary
  // does not. An attacker who could plant a file literally named "orca-slicer" on the
  // victim's disk already has code execution by other means, so this grants nothing new.
  const SLICER_NAME_RE = /(slic|orca|snapmaker|bambu|prusa|cura|creality|chitubox|lychee|flashprint|ideamaker|simplify|qidi|elegoo|anycubic|anker|eufymake|photon|satellite|voxeldance|icesl|kisslicer|sovol)/i;

  /**
   * True when `p` is allowed to be launched as a slicer executable.
   * Positive allowlist by name — see the note above. Returns false for anything
   * that does not look like a slicer, which is the safe default for an untrusted path.
   */
  function isAllowedSlicerBinary(p) {
    const base = String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
    // Strip platform launcher extensions so "OrcaSlicer.AppImage" / "PrusaSlicer.exe" match.
    const stem = base.replace(/\.(exe|app|appimage|bat|cmd|com|scr|ps1)$/i, '');
    if (!stem) return false;
    return SLICER_NAME_RE.test(stem);
  }

  const api = { listSlicers, defaultSlicer, getSlicer, slicerDisplayName, isAllowedSlicerBinary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytSlicers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
