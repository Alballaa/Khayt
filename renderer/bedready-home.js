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

  function startHealing() {
    ensureHome();
    var sec = document.getElementById('dashboard-tab');
    if (sec && typeof MutationObserver === 'function') {
      var obs = new MutationObserver(function () { ensureHome(); });
      obs.observe(sec, { childList: true, subtree: true });
      // Boot settles well under 4s; stop observing afterwards so normal
      // renderDashboard() calls own the content from then on.
      setTimeout(function () { obs.disconnect(); }, 4000);
    }
    // Belt-and-braces poll in case the observer misses an out-of-subtree swap.
    var tries = 0;
    var iv = setInterval(function () { ensureHome(); if (++tries >= 30) clearInterval(iv); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startHealing);
  } else {
    startHealing();
  }
})();
