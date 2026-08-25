/**
 * Visual theme picker — card grid with preview screenshots.
 */
(function (global) {
  const reg = () => global.KhaytThemeRegistry;

  function tr(key, fallback) {
    if (typeof t === 'function') {
      const v = t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function themeLabel(theme, id) {
    if (theme?.label) return theme.label;
    return tr(theme?.labelKey, id);
  }

  function themeDesc(theme) {
    if (theme?.description) return theme.description;
    return tr(theme?.descKey, '');
  }

  function previewSrc(theme, id) {
    if (theme?.preview) return theme.preview;
    const base = reg()?.isCustomThemeId?.(id) ? `themes/custom/${reg().customIdFromTheme(id)}/preview.png` : `themes/previews/${id}.png`;
    return base;
  }

  /**
   * What a shop gives up, or gains, by choosing this design.
   *
   * The layouts are deliberately different screens, so switching does not only
   * change the look — it can remove a figure. Average margin is on two of the
   * eight. Someone who picked a design because they liked it had no way to learn
   * that until they went looking for a number that was no longer there.
   *
   * Only ever shown against the CURRENT choice, and only when something actually
   * changes: a card that costs nothing says nothing.
   */
  function tradeoffHtml(id, currentId) {
    const caps = global.KhaytThemeCapabilities;
    if (!caps || !currentId || id === currentId) return '';
    const { gained, lost } = caps.differenceBetween(currentId, id);
    const name = (c) => escapeHtml(tr('cap.' + c, (caps.CAPABILITIES[c] || {}).label || c));
    const bits = [];
    if (lost.length) {
      bits.push(`<span class="theme-picker-tradeoff lost">${escapeHtml(tr('theme.design.hides', 'Hides'))} ${lost.map(name).join(', ')}</span>`);
    }
    if (gained.length) {
      bits.push(`<span class="theme-picker-tradeoff gained">${escapeHtml(tr('theme.design.adds', 'Adds'))} ${gained.map(name).join(', ')}</span>`);
    }
    return bits.join('');
  }

  function cardHtml(id, theme, { selected, disabled, soon, currentId }) {
    const label = escapeHtml(themeLabel(theme, id));
    const desc = escapeHtml(themeDesc(theme));
    const src = escapeHtml(previewSrc(theme, id));
    const sel = selected ? ' selected' : '';
    const soonCls = soon ? ' is-soon' : '';
    const dis = disabled ? ' disabled' : '';
    const badge = soon
      ? `<span class="theme-picker-badge">${escapeHtml(tr('theme.design.soon_badge', 'Coming soon'))}</span>`
      : (selected ? `<span class="theme-picker-badge">${escapeHtml(tr('theme.design.selected_badge', 'Selected'))}</span>` : '');

    return `<button type="button" class="theme-picker-card${sel}${soonCls}" data-theme-id="${escapeHtml(id)}"${dis} role="radio" aria-checked="${selected ? 'true' : 'false'}" aria-label="${label}">
      <img class="theme-picker-shot" src="${src}" alt="" loading="lazy" />
      <span class="theme-picker-body">
        <strong>${label}</strong>
        <span>${desc}</span>
        ${tradeoffHtml(id, currentId)}
        ${badge}
      </span>
    </button>`;
  }

  function renderPicker(container, selectedId, { includeSoon = false } = {}) {
    if (!container || !reg()) return;
    const selectable = reg().listSelectableThemes();
    const soon = includeSoon ? reg().listComingSoonThemes() : [];
    const selected = reg().normalizeDesignId(selectedId || 'studio');

    let html = '';
    for (const id of selectable) {
      const theme = reg().getTheme(id);
      html += cardHtml(id, theme, { selected: id === selected, disabled: false, soon: false, currentId: selected });
    }
    for (const id of soon) {
      // Coming-soon themes are enabled:false, and getTheme() normalises that to
      // workbench — so every one of these cards drew Workbench's name and
      // description under a COMING SOON badge. Label from the raw definition.
      const theme = reg().getThemeDefinition(id) || reg().getTheme(id);
      html += cardHtml(id, theme, { selected: false, disabled: true, soon: true, currentId: selected });
    }

    container.innerHTML = html;
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-label', tr('theme.design.label', 'Design'));
    container.querySelectorAll('.theme-picker-shot').forEach((img) => {
      img.addEventListener('error', () => {
        const fb = document.createElement('div');
        fb.className = 'theme-picker-shot-fallback';
        fb.textContent = img.closest('.theme-picker-card')?.querySelector('strong')?.textContent || '';
        img.replaceWith(fb);
      }, { once: true });
    });
  }

  function bindPicker(container, { onSelect, livePreview = false } = {}) {
    if (!container || container.dataset.themePickerBound === '1') return;
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.theme-picker-card[data-theme-id]');
      if (!card || card.disabled) return;
      const id = card.dataset.themeId;
      if (!id) return;

      container.querySelectorAll('.theme-picker-card').forEach((c) => {
        const on = c.dataset.themeId === id;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
        const badge = c.querySelector('.theme-picker-badge');
        if (badge && !c.classList.contains('is-soon')) {
          badge.textContent = on ? tr('theme.design.selected_badge', 'Selected') : '';
          badge.style.display = on ? '' : 'none';
        }
      });

      const hidden = document.getElementById(container.dataset.syncInput);
      if (hidden) hidden.value = id;

      if (livePreview && typeof settings !== 'undefined') {
        const prev = settings.designTheme;
        settings.designTheme = id;
        const theme = reg()?.getTheme(id);
        if (theme?.defaultAppearance && prev !== id) {
          settings.theme = theme.defaultAppearance;
          if (typeof applyTheme === 'function') applyTheme(theme.defaultAppearance);
          const themeSel = document.getElementById('set_theme');
          if (themeSel) themeSel.value = theme.defaultAppearance;
        }
        if (typeof applyDesignSettings === 'function') applyDesignSettings();
      }

      if (typeof onSelect === 'function') onSelect(id);
    });
    container.dataset.themePickerBound = '1';
  }

  function mountSettingsPicker() {
    const container = document.getElementById('set_designThemePicker');
    const hidden = document.getElementById('set_designTheme');
    if (!container) return;
    if (hidden) container.dataset.syncInput = 'set_designTheme';
    const design = reg()?.normalizeDesignId(settings?.designTheme || hidden?.value || 'studio') || 'studio';
    renderPicker(container, design, { includeSoon: true });
    bindPicker(container, {
      livePreview: true,
      onSelect(id) {
        if (typeof settings !== 'undefined') settings.designTheme = id;
        const hint = document.getElementById('set_designTheme_hint');
        const theme = reg()?.getTheme(id);
        if (hint && theme?.descKey) hint.textContent = tr(theme.descKey, hint.textContent);
        if (hidden) hidden.value = id;
        if (typeof populateAccentSelect === 'function') populateAccentSelect(id);
        if (typeof saveAll === 'function') saveAll();
        if (typeof toast === 'function') toast(tr('set.saved', 'Saved'), 'success', 2000);
      },
    });
  }

  function mountWizardPicker(container, selectedId) {
    if (!container) return;
    renderPicker(container, selectedId || 'studio', { includeSoon: false });
    bindPicker(container, {
      livePreview: true,
      onSelect(id) {
        container.dataset.selectedTheme = id;
      },
    });
    container.dataset.selectedTheme = reg()?.normalizeDesignId(selectedId || 'studio') || 'studio';
  }

  function getWizardSelection(container) {
    return container?.dataset.selectedTheme || 'studio';
  }

  global.KhaytThemePicker = {
    renderPicker,
    bindPicker,
    mountSettingsPicker,
    mountWizardPicker,
    getWizardSelection,
    previewSrc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
