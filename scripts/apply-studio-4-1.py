#!/usr/bin/env python3
"""Wire KhaytStudio module and remove inlined phase-4 block from app.js."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "renderer" / "app.js"
INDEX = Path(__file__).resolve().parents[1] / "renderer" / "index.html"

START = "/* ============================================================\n   Khayt Studio — phase 4"
END = "function initStudioPhase4()"


def strip_phase4_block(js: str) -> str:
    i = js.find(START)
    if i < 0:
        print("phase4 block not found (maybe already stripped)")
        return js
    j = js.find(END, i)
    if j < 0:
        raise SystemExit("initStudioPhase4 not found")
    k = js.find("/* ============================================================\n   Tabs", j)
    if k < 0:
        k = js.find("function switchTab(", j)
    if k < 0:
        raise SystemExit("Tabs section not found after phase4")
    return js[:i] + js[k:]


def patch(js: str) -> str:
    js = strip_phase4_block(js)

    js = js.replace(
        "  initStudioPhase4();\n\n  $('.kanban')",
        "  window.KhaytStudio?.init?.();\n\n  $('.kanban')",
    )
    js = js.replace(
        "    col.querySelector('.list')?.classList.add('khayt-kcol-body');",
        "    col.querySelector('[id^=\"list-\"]')?.classList.add('khayt-kcol-body');",
    )

    if "KhaytStudio.orderMatchesStudioQueueFilter" not in js:
        js = js.replace(
            "    if (!orderMatchesStudioQueueFilter(o)) return false;",
            "    if (window.KhaytStudio?.orderMatchesStudioQueueFilter?.(o) === false) return false;",
        )
        js = js.replace(
            "    if (!orderMatchesStudioQueueFilter(o)) return false;",
            "    if (window.KhaytStudio?.orderMatchesStudioQueueFilter?.(o) === false) return false;",
        )

    if "KhaytStudio.renderInventoryStudioStats" not in js:
        js = js.replace(
            "  renderInventoryStudioStats();\n  renderReorderAlerts();",
            "  window.KhaytStudio?.renderInventoryStudioStats?.();\n  renderReorderAlerts();",
        )

    if "KhaytStudio.renderClientsStudioCards" not in js:
        js = js.replace(
            "  if (renderClientsStudioCards(filtered, clientMaps)) return;",
            "  if (window.KhaytStudio?.renderClientsStudioCards?.(filtered, clientMaps)) return;",
        )

    if "KhaytStudio.initStudioCalculatorLayout" not in js:
        js = js.replace(
            "  if (tabId === 'calculator-tab')  initStudioCalculatorLayout();",
            "  if (tabId === 'calculator-tab')  window.KhaytStudio?.initStudioCalculatorLayout?.();",
        )

    # inv valuation hide in studio
    if "KhaytStudio.isStudio" not in js or "invValuationSummary" not in js.split("renderInventory")[1][:800]:
        old = """  const valEl = $('#invValuationSummary');
  if (valEl) {
    if (inventory.length > 0) {"""
        new = """  const valEl = $('#invValuationSummary');
  if (valEl && !window.KhaytStudio?.isStudio?.()) {
    if (inventory.length > 0) {"""
        if old in js:
            js = js.replace(old, new, 1)

    # inventory studio meter in weight cell - find weight td line
    needle = "          <td style=\"font-variant-numeric: tabular-nums;\">${Math.round(item.weight)} ${weightUnit}</td>"
    if needle in js and "invStockMeterHtml" not in js:
        repl = """          <td style="font-variant-numeric: tabular-nums;">
            ${window.KhaytStudio?.isStudio?.() ? window.KhaytStudio.invStockMeterHtml(item) : `${Math.round(item.weight)} ${weightUnit}`}
          </td>"""
        js = js.replace(needle, repl, 1)

    # dashboard attention icons
    old_attn = '<div class="khayt-attn-ic" style="color:${a.color};background:color-mix(in srgb, ${a.color} 14%, transparent)">${a.icon}</div>'
    new_attn = '<div class="khayt-attn-ic" style="color:${a.color};background:color-mix(in srgb, ${a.color} 14%, transparent)">${window.KhaytStudio?.attentionIconSvg?.(a.iconKind) || a.icon}</div>'
    if old_attn in js:
        js = js.replace(old_attn, new_attn, 1)

    # add iconKind to attention pushes - batch replace emoji icons with kinds
    replacements = [
        ("icon: '⚠', color: 'var(--warn)'", "icon: '⚠', iconKind: 'warn', color: 'var(--warn)'"),
        ("icon: '⏱', color: 'var(--danger)'", "icon: '⏱', iconKind: 'danger', color: 'var(--danger)'"),
        ("icon: '⬡', color: 'var(--warn)'", "icon: '⬡', iconKind: 'stock', color: 'var(--warn)'"),
        ("icon: '📋', color: 'var(--info)'", "icon: '📋', iconKind: 'info', color: 'var(--info)'"),
        ("icon: '📅', color: 'var(--info)'", "icon: '📅', iconKind: 'calendar', color: 'var(--info)'"),
        ("icon: '▤', color: 'var(--ok)'", "icon: '▤', iconKind: 'queue', color: 'var(--ok)'"),
    ]
    for o, n in replacements:
        if o in js and "iconKind" not in js[js.find(o)-50:js.find(o)+80]:
            js = js.replace(o, n, 1)

    return js


def patch_index(html: str) -> str:
    if 'studio/studio.js' not in html:
        html = html.replace(
            '<script src="studio/icons.js"></script>\n<script src="app.js"></script>',
            '<script src="studio/icons.js"></script>\n<script src="studio/studio.js"></script>\n<script src="app.js"></script>',
        )
    if 'studioQueueMachineWrap' not in html:
        html = html.replace(
            '<button type="button" data-queue-filter="machine">By machine</button>\n        </div>\n      </div>',
            '<button type="button" data-queue-filter="machine" data-i18n="queue.filter_machine">By machine</button>\n        </div>\n        <div id="studioQueueMachineWrap" class="khayt-queue-machine-wrap" style="display:none" aria-hidden="true">\n          <select id="studioQueueMachine" class="input" style="min-width:200px;height:34px"></select>\n        </div>\n      </div>',
        )
    seg_buttons = [
        ('data-queue-filter="all">All', 'data-queue-filter="all" data-i18n="queue.filter_all">All'),
        ('data-queue-filter="fdm">FDM', 'data-queue-filter="fdm" data-i18n="queue.filter_fdm">FDM'),
        ('data-queue-filter="resin">Resin', 'data-queue-filter="resin" data-i18n="queue.filter_resin">Resin'),
        ('data-client-filter="all">All', 'data-client-filter="all" data-i18n="cl.filter_all">All'),
        ('data-client-filter="vat">VAT', 'data-client-filter="vat" data-i18n="cl.filter_vat">VAT'),
        ('data-client-filter="b2c">B2C', 'data-client-filter="b2c" data-i18n="cl.filter_b2c">B2C'),
        ('data-client-filter="balance">Has balance', 'data-client-filter="balance" data-i18n="cl.filter_balance">Has balance'),
    ]
    for o, n in seg_buttons:
        if o in html and 'data-i18n' not in html[html.find(o)-30:html.find(o)+len(o)+20]:
            html = html.replace(o, n, 1)

    if 'calcTechSeg' not in html and 'card material' in html:
        html = html.replace(
            '<h3 class="card-head"><span class="swatch"></span><span data-i18n="calc.part.title">1. Part & Material</span></h3>',
            '<div class="row between wrap gap12" style="margin-bottom:14px;align-items:center">\n          <h3 class="card-head" style="margin:0"><span class="swatch"></span><span data-i18n="calc.part.title">1. Part & Material</span></h3>\n          <div class="seg" id="calcTechSeg" role="group" aria-label="Print technology">\n            <button type="button" class="on" data-calc-tech="fdm" data-i18n="queue.filter_fdm">FDM</button>\n            <button type="button" data-calc-tech="resin" data-i18n="queue.filter_resin">Resin</button>\n          </div>\n        </div>',
            1,
        )
    return html


def patch_i18n():
    p = Path(__file__).resolve().parents[1] / "renderer" / "i18n.js"
    text = p.read_text()
    keys_en = """
    'queue.filter_all':       'All',
    'queue.filter_fdm':       'FDM',
    'queue.filter_resin':     'Resin',
    'queue.filter_machine':   'By machine',
    'queue.filter_machine_all': 'All assigned printers',
    'cl.filter_all':          'All',
    'cl.filter_vat':          'VAT',
    'cl.filter_b2c':          'B2C',
    'cl.filter_balance':      'Has balance',
    'inv.total_spools':       'Total spools',
    'inv.drying_now':         'Drying now',
    'inv.items':              'items',
    'inv.reorder_at':         'reorder',
    'cl.credit_used':         'Credit used',
"""
    keys_ar = """
    'queue.filter_all':       'الكل',
    'queue.filter_fdm':       'FDM',
    'queue.filter_resin':     'راتنج',
    'queue.filter_machine':   'حسب الطابعة',
    'queue.filter_machine_all': 'كل الطابعات المعيّنة',
    'cl.filter_all':          'الكل',
    'cl.filter_vat':          'ضريبة',
    'cl.filter_b2c':          'أفراد',
    'cl.filter_balance':      'رصيد مستحق',
    'inv.total_spools':       'إجمالي البكرات',
    'inv.drying_now':         'يجف الآن',
    'inv.items':              'عناصر',
    'inv.reorder_at':         'إعادة الطلب',
    'cl.credit_used':         'الائتمان المستخدم',
"""
    if "'queue.filter_all'" not in text:
        text = text.replace(
            "    'tab.settings':         'Settings',\n",
            "    'tab.settings':         'Settings',\n" + keys_en,
            1,
        )
    if text.count("'queue.filter_all'") < 2:
        # add to ar block - find second tab.settings in ar
        marker = "  ar: {"
        ar_tab = "    'tab.settings':"
        idx = text.find(marker)
        idx2 = text.find(ar_tab, idx)
        if idx2 > 0 and keys_ar.strip().split("\n")[1].strip("'") not in text[idx:idx+50000]:
            line_end = text.find("\n", idx2)
            text = text[:line_end+1] + keys_ar + text[line_end+1:]
    p.write_text(text)


def main():
    js = APP.read_text(encoding="utf-8")
    APP.write_text(patch(js), encoding="utf-8")
    html = INDEX.read_text(encoding="utf-8")
    INDEX.write_text(patch_index(html), encoding="utf-8")
    patch_i18n()
    print("Applied studio 4.1 patches")


if __name__ == "__main__":
    main()
