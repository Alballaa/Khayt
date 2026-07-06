/* ============================================================
   BED READY — branded home hero.
   Replaces the shared Khayt dashboard with a lean, on-brand maker
   home (echoing bedready.io): geometric headline, sticker badges,
   and quick-action cards into the maker tools. Bed Ready flavor only.

   Mechanism: dashboard.js declares `function renderDashboard()`, which
   initialRender() (app-boot.js) and tab switches call by bareword — a
   global binding. This file is loaded AFTER dashboard.js and BEFORE
   app-boot.js, so reassigning `window.renderDashboard` here swaps in the
   Bed Ready home for every call. Guarded on the flavor marker so it can
   never affect Khayt.

   Self-heal: during boot the studio shell (initAppShell → KhaytStudio)
   re-mounts and empties #dashboardContent AFTER initialRender's first
   render, leaving the landing dashboard blank. A short-lived observer +
   poll re-renders the home into the live node whenever the dashboard tab
   is active and empty, until it sticks. Tab switches thereafter go
   through renderDashboard (this override) as normal.
   ============================================================ */
(function () {
  if (typeof document === 'undefined' || document.documentElement.dataset.app !== 'bedready') return;

  // ── Copy overrides ─────────────────────────────────────────────────────────
  // Rename Khayt / business terms to Bed Ready maker terms across every language.
  // i18n's STRINGS table aliases globalThis.KhaytLocales, and this renderer runs
  // in its own process, so mutating it here re-labels nav + topbar + placeholders
  // at once and never touches Khayt. Applied to all loaded locales (English maker
  // wording is fine for these product-specific terms).
  try {
    var LOC = (typeof globalThis !== 'undefined' && globalThis.KhaytLocales) || (typeof window !== 'undefined' && window.KhaytLocales) || null;
    if (LOC) {
      var OV = {
        'tab.queue': 'Print Queue',
        'queue.title': 'Print queue',
        'kan.search_ph': 'Filter jobs…',
        'kan.orders': 'jobs',
        'slicer.slice_btn': '🧩 Slice for exact weight',
        'tab.sub.settings': 'Preferences, inventory & data',
        'set.biz_ar': 'Studio name (Arabic)',
        'set.logo': 'Logo',
        'set.biz_identity': 'Studio identity',
        'waiting.title': 'Job intake',
        'mach.empty': 'No printers added yet — add one to assign jobs to a machine.',
        'queue.empty': 'No jobs here.',
        'calc.quote.empty': 'No parts in this project yet. The live preview below reflects the current form.',
        'calc.quote.add_part': '+ Add part to project',
        'set.tagline_ph': 'e.g. Multi-colour minis & functional prints',
        // Updater copy that bakes in the Khayt product name.
        'upd.ready_version': 'Bed Ready {version} will install after restart.',
        'set.beta_updates': 'Include Bed Ready beta pre-releases when checking for updates',
        // Settings card holds both language + theme selects.
        'set.lang_theme_head': 'Language & Theme',
      };
      Object.keys(LOC).forEach(function (lang) {
        if (LOC[lang] && typeof LOC[lang] === 'object') {
          Object.keys(OV).forEach(function (k) { LOC[lang][k] = OV[k]; });
        }
      });
    }
  } catch (e) { /* non-fatal */ }

  // Maker stats — computed from completed prints (grams used, spend, top
  // materials). Reuses the same per-part fields the shared analytics use, but
  // framed for a hobbyist (no revenue/margin). Returns '' when there's nothing
  // printed yet so the home stays clean on a fresh install.
  function makerStatsHtml() {
    var log = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    var inv = (typeof inventory !== 'undefined' && Array.isArray(inventory)) ? inventory : [];
    var done = log.filter(function (o) { return o && o.status === 'completed'; });
    if (done.length === 0) return '';

    var grams = 0, spend = 0;
    var byMat = {};
    done.forEach(function (o) {
      (o.parts || []).forEach(function (p) {
        var pw = (+p.printWeight || 0) + (+p.supportWeight || 0);
        if (pw <= 0) return;
        grams += pw;
        var spoolC = +p.spoolCost || 0, spoolW = Math.max(1, +p.spoolWeight || 1000);
        spend += (spoolC / spoolW) * pw;
        var fil = inv.find(function (i) { return i.id === p.filamentId; });
        var label = p.material || (fil && fil.material) || 'Filament';
        var color = (fil && fil.color) || '#888';
        if (!byMat[label]) byMat[label] = { label: label, color: color, grams: 0 };
        byMat[label].grams += pw;
      });
    });

    var top = Object.keys(byMat).map(function (k) { return byMat[k]; })
      .sort(function (a, b) { return b.grams - a.grams; }).slice(0, 4);
    var esc = (typeof escapeHtml === 'function') ? escapeHtml : function (s) { return s; };
    var money = (typeof fmtPrice === 'function') ? fmtPrice(spend) : String(Math.round(spend));
    var kg = grams >= 1000 ? (grams / 1000).toFixed(grams >= 10000 ? 0 : 1) + ' kg' : Math.round(grams) + ' g';

    var stat = function (val, lab) {
      return '<div class="br-stat"><div class="br-stat-val">' + val + '</div><div class="br-stat-lab">' + lab + '</div></div>';
    };
    var topHtml = top.map(function (m) {
      var pct = grams > 0 ? Math.round(m.grams / grams * 100) : 0;
      var g = m.grams >= 1000 ? (m.grams / 1000).toFixed(1) + ' kg' : Math.round(m.grams) + ' g';
      return '<div class="br-mat-row">'
        + '<span class="br-mat-dot" style="background:' + esc(String(m.color)) + '"></span>'
        + '<span class="br-mat-name">' + esc(m.label) + '</span>'
        + '<span class="br-mat-bar"><span style="width:' + pct + '%"></span></span>'
        + '<span class="br-mat-g">' + g + '</span>'
        + '</div>';
    }).join('');

    return [
      '<section class="br-stats">',
        '<div class="br-stats-head">Your printing so far</div>',
        '<div class="br-stat-row">',
          stat(String(done.length), done.length === 1 ? 'print done' : 'prints done'),
          stat(esc(kg), 'filament used'),
          stat(esc(money), 'material spend'),
        '</div>',
        top.length ? '<div class="br-mat-list">' + topHtml + '</div>' : '',
      '</section>',
    ].join('');
  }

  function homeHtml() {
    return [
      '<div class="br-home">',
        '<section class="br-hero">',
          '<p class="br-hero-eyebrow">Bed Ready · Maker Studio</p>',
          '<h1>3D-print files,<br>ready for <span class="accent">any bed</span>.</h1>',
          '<p class="br-hero-sub">Convert, recolour and queue your prints — agnostic by design, nothing ever uploaded.</p>',
          '<div class="br-stickers">',
            '<span class="br-sticker spectrum">full-spectrum</span>',
            '<span class="br-sticker">any bed</span>',
            '<span class="br-sticker orange">nothing uploaded</span>',
            '<span class="br-sticker">built for makers</span>',
          '</div>',
          '<div class="br-actions">',
            '<button type="button" class="br-action" data-go="converter-tab"><span class="ico" aria-hidden="true">🔄</span><span class="t"><b>Convert a file</b><span>3MF / STL → any printer</span></span></button>',
            '<button type="button" class="br-action orange" data-go="colorstudio-tab"><span class="ico" aria-hidden="true">🎨</span><span class="t"><b>Colour Studio</b><span>plan multi-colour prints</span></span></button>',
            '<button type="button" class="br-action" data-go="queue-tab"><span class="ico" aria-hidden="true">▤</span><span class="t"><b>Production queue</b><span>track your jobs</span></span></button>',
          '</div>',
        '</section>',
        makerStatsHtml(),
        '<div class="br-home-grid">',
          '<button type="button" class="br-action" data-go="inventory-tab"><span class="ico" aria-hidden="true">⬡</span><span class="t"><b>Inventory</b><span>filament & stock</span></span></button>',
          '<button type="button" class="br-action" data-go="printfiles-tab"><span class="ico" aria-hidden="true">🧊</span><span class="t"><b>Print files</b><span>your model library</span></span></button>',
          '<button type="button" class="br-action" data-go="calculator-tab"><span class="ico" aria-hidden="true">◎</span><span class="t"><b>Calculator</b><span>cost per print</span></span></button>',
        '</div>',
      '</div>',
    ].join('');
  }

  function fill(el) {
    el.innerHTML = homeHtml();
    el.querySelectorAll('.br-action').forEach(function (b) {
      b.addEventListener('click', function () {
        var go = b.getAttribute('data-go');
        if (go && window.KhaytShell && typeof window.KhaytShell.switchTab === 'function') {
          window.KhaytShell.switchTab(go);
        }
      });
    });
  }

  // Only self-heal AFTER boot has rendered the dashboard at least once. boot's
  // initialRender() calls renderDashboard() after the store loads + applyMode()
  // runs; flipping this flag there keeps us from painting the home before the app
  // is ready (which would let readiness checks pass on a half-booted app).
  var booted = false;

  function brRenderHome() {
    booted = true;
    var el = document.getElementById('dashboardContent');
    if (el) fill(el);
  }

  // Swap the shared dashboard renderer for the Bed Ready home (covers
  // initialRender + every tab switch).
  window.renderDashboard = brRenderHome;

  // Self-heal the landing render, which the studio shell clobbers during boot.
  function ensureHome() {
    if (!booted) return;
    var sec = document.getElementById('dashboard-tab');
    var el = document.getElementById('dashboardContent');
    if (sec && sec.classList.contains('active') && el && el.innerHTML.trim().length === 0) {
      fill(el);
    }
  }

  // Re-apply translations once the app has booted, so the copy overrides above
  // land on nav / placeholders / labels that were painted before this ran.
  function reapplyI18n() {
    try { if (typeof i18n !== 'undefined' && typeof i18n.applyToDom === 'function') i18n.applyToDom(); } catch (e) {}
  }

  function startHealing() {
    ensureHome();
    reapplyI18n();
    var sec = document.getElementById('dashboard-tab');
    if (sec && typeof MutationObserver === 'function') {
      var obs = new MutationObserver(function () { ensureHome(); });
      obs.observe(sec, { childList: true, subtree: true });
      // Boot settles well under 4s; stop observing afterwards so normal
      // renderDashboard() calls own the content from then on.
      setTimeout(function () { obs.disconnect(); }, 4000);
    }
    // Belt-and-braces poll in case the observer misses an out-of-subtree swap.
    // Also re-apply i18n for the first ~1s so overrides land after boot renders.
    var tries = 0;
    var iv = setInterval(function () { ensureHome(); if (tries < 8) reapplyI18n(); if (++tries >= 30) clearInterval(iv); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startHealing);
  } else {
    startHealing();
  }
})();
