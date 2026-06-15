// cockpit/sections.jsx — Khayt Cockpit: queue, inventory, calculator, analytics, clients.
// Same poster aesthetic as the dashboard: jet ink, chunky borders, vivid stage-coding,
// IBM Plex Mono numerics. Driven by shared window.KHAYT data.
const { useState: ckUseState } = React;
const K = window.KHAYT;
const SAR = (n) => Number(n).toLocaleString("en-US");

/* stage → cockpit colour */
const CK_STAGE = {
  pending:  { label: "Pending",  c: "var(--ink-4)" },
  printing: { label: "Printing", c: "var(--c-print)" },
  post:     { label: "Post",     c: "var(--c-maint)" },
  qc:       { label: "QC",       c: "var(--c-post)" },
  done:     { label: "Done",     c: "var(--c-ready)" },
};
const CK_PRIO = {
  high: { label: "HIGH", c: "var(--c-error)" },
  med:  { label: "MED",  c: "var(--c-post)" },
  low:  { label: "LOW",  c: "var(--ink-4)" },
};

/* shared section scaffold ------------------------------------------------ */
function CkSec({ bar, children }) {
  return (
    <div className="ck-section">
      {bar && <div className="ck-secbar">{bar}</div>}
      <div className="ck-scroll">{children}</div>
    </div>
  );
}
function CkChips({ items, active, set }) {
  return (
    <div className="ck-chips">
      {items.map((c) => (
        <button key={c} className={"ck-chip" + (active === c ? " on" : "")} onClick={() => set(c)}>{c}</button>
      ))}
    </div>
  );
}

/* =========================================================== QUEUE (kanban) */
function CkQueue() {
  return (
    <CkSec bar={
      <>
        <CkChips items={["All machines"]} active="All machines" set={() => {}} />
        <span style={{ flex: 1 }}></span>
        <span className="ck-barnote mono">12 orders · 4,765 SAR in flight</span>
      </>
    }>
      <div className="ck-kanban">
        {K.stages.map((st) => {
          const col = K.orders.filter((o) => o.stage === st);
          const meta = CK_STAGE[st];
          const val = col.reduce((s, o) => s + o.value, 0);
          return (
            <div key={st} className="ck-kcol">
              <div className="ck-khead" style={{ "--kc": meta.c }}>
                <span className="dot"></span>
                <span className="lbl">{meta.label}</span>
                <span className="cnt mono">{col.length}</span>
                <span style={{ flex: 1 }}></span>
                <span className="sum mono">{SAR(val)}</span>
              </div>
              <div className="ck-kcards">
                {col.map((o) => {
                  const p = CK_PRIO[o.priority];
                  return (
                    <div key={o.id} className="ck-kcard" style={{ "--kc": meta.c }}>
                      <div className="row">
                        <span className="oid mono">{o.id}</span>
                        <span className="prio mono" style={{ color: p.c }}>{p.label}</span>
                        <span style={{ flex: 1 }}></span>
                        <span className="due mono">{o.due}</span>
                      </div>
                      <div className="cl">{o.client}</div>
                      <div className="mat">
                        <span className="sw" style={{ background: o.colorHex }}></span>
                        <span>{o.color}</span>
                        <span className="parts mono">×{o.parts}</span>
                      </div>
                      <div className="foot">
                        <span className="mc">{o.machine}</span>
                        <span style={{ flex: 1 }}></span>
                        <span className="val mono">{SAR(o.value)}</span>
                      </div>
                      {o.stage === "printing" && (
                        <div className="ck-bar" style={{ marginTop: 8, "--st": meta.c }}>
                          <i style={{ width: o.progress + "%", background: meta.c }}></i>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CkSec>
  );
}

/* =========================================================== INVENTORY */
function CkInventory() {
  const [tab, setTab] = ckUseState("All");
  const types = ["All", "FDM", "Resin"];
  const rows = K.filaments.filter((f) => tab === "All" || f.type === tab);
  const MAXG = 3200;
  return (
    <CkSec bar={
      <>
        <CkChips items={types} active={tab} set={setTab} />
        <span style={{ flex: 1 }}></span>
        <span className="ck-barnote mono">{rows.length} materials</span>
        <button className="ck-btn quiet sm"><Icon name="plus" size={14} /> Add material</button>
      </>
    }>
      <div className="ck-tbl">
        <div className="ck-tr ck-th">
          <span style={{ width: 220 }}>Material</span>
          <span style={{ width: 70 }}>Type</span>
          <span style={{ flex: 1 }}>Stock</span>
          <span style={{ width: 70, textAlign: "end" }}>Spools</span>
          <span style={{ width: 90, textAlign: "end" }}>Cost / kg</span>
          <span style={{ width: 96, textAlign: "end" }}>Status</span>
        </div>
        {rows.map((f) => {
          const low = f.grams < f.reorder;
          return (
            <div key={f.id} className="ck-tr">
              <div style={{ width: 220, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span className="ck-swatch" style={{ background: f.hex }}></span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{f.name}</div>
                  <div className="sub mono">{f.brand}</div>
                </div>
              </div>
              <span style={{ width: 70 }}><span className="ck-tag">{f.type}</span></span>
              <div style={{ flex: 1, paddingInlineEnd: 18 }}>
                <div className="ck-bar"><i style={{ width: Math.min(100, (f.grams / MAXG) * 100) + "%", background: low ? "var(--c-error)" : "var(--c-ready)" }}></i></div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4 }}>
                  {SAR(f.grams)} g <span style={{ opacity: .6 }}>· reorder {SAR(f.reorder)} g</span>
                </div>
              </div>
              <span className="mono" style={{ width: 70, textAlign: "end", fontWeight: 600 }}>{f.spools}</span>
              <span className="mono" style={{ width: 90, textAlign: "end", fontWeight: 600 }}>{f.cost}</span>
              <span style={{ width: 96, textAlign: "end" }}>
                {low
                  ? <span className="ck-pill hot">REORDER</span>
                  : f.drying
                    ? <span className="ck-pill warn">DRYING</span>
                    : <span className="ck-pill ok">OK</span>}
              </span>
            </div>
          );
        })}
      </div>
    </CkSec>
  );
}

/* =========================================================== CALCULATOR */
function CkCalculator() {
  const total = K.costBreak.reduce((s, c) => s + c.value, 0);
  const margin = 0.41;
  const price = total / (1 - margin);
  return (
    <CkSec>
      <div className="ck-calc">
        {/* parts cart */}
        <div className="ck-card">
          <div className="ck-cardhead"><h3>Parts</h3><span className="ck-barnote mono">{K.cart.length} items</span></div>
          <div className="ck-tbl tight">
            <div className="ck-tr ck-th">
              <span style={{ flex: 1 }}>Part</span>
              <span style={{ width: 44, textAlign: "end" }}>Qty</span>
              <span style={{ width: 70, textAlign: "end" }}>Grams</span>
              <span style={{ width: 64, textAlign: "end" }}>Hours</span>
              <span style={{ width: 76, textAlign: "end" }}>Cost</span>
            </div>
            {K.cart.map((c) => (
              <div key={c.id} className="ck-tr">
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span className="ck-swatch sm" style={{ background: c.hex }}></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{c.name}</div>
                    <div className="sub mono">{c.filament}</div>
                  </div>
                </div>
                <span className="mono" style={{ width: 44, textAlign: "end", fontWeight: 600 }}>{c.qty}</span>
                <span className="mono" style={{ width: 70, textAlign: "end" }}>{c.grams}</span>
                <span className="mono" style={{ width: 64, textAlign: "end" }}>{c.time}</span>
                <span className="mono" style={{ width: 76, textAlign: "end", fontWeight: 600 }}>{c.cost.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <button className="ck-btn quiet sm" style={{ margin: 12 }}><Icon name="plus" size={14} /> Add part</button>
        </div>

        {/* cost breakdown + quote */}
        <div className="ck-card">
          <div className="ck-cardhead"><h3>Cost breakdown</h3><span className="ck-barnote mono">per batch</span></div>
          <div style={{ padding: 14 }}>
            <div className="ck-stack">
              {K.costBreak.map((c, i) => (
                <span key={i} className="seg" style={{ width: c.pct + "%", background: CALC_COLORS[i] }} title={c.label}></span>
              ))}
            </div>
            <div className="ck-legrows">
              {K.costBreak.map((c, i) => (
                <div key={i} className="ck-legrow">
                  <span className="sw" style={{ background: CALC_COLORS[i] }}></span>
                  <span className="lb">{c.label}</span>
                  <span className="pc mono">{c.pct}%</span>
                  <span className="vl mono">{c.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="ck-quote">
              <div className="qrow"><span>Unit cost</span><span className="mono">{total.toFixed(2)} SAR</span></div>
              <div className="qrow"><span>Target margin</span><span className="mono">{Math.round(margin * 100)}%</span></div>
              <div className="qrow total"><span>Quote price</span><span className="mono">{price.toFixed(0)} SAR</span></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="ck-btn primary" style={{ flex: 1 }}><Icon name="doc" size={15} /> Generate quote</button>
              <button className="ck-btn quiet"><Icon name="link" size={15} /></button>
            </div>
          </div>
        </div>
      </div>
    </CkSec>
  );
}
const CALC_COLORS = ["var(--c-print)", "var(--c-maint)", "var(--c-post)", "var(--c-ready)", "var(--ink-4)", "var(--c-error)"];

/* =========================================================== ANALYTICS */
function CkAnalytics() {
  const rev = [18, 21, 19, 24, 22, 27, 25, 29, 26, 31, 28, 24.68];
  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  const util = [["Prusa CORE One", 91], ["Bambu X1C · A", 84], ["Saturn 4 Ultra", 78], ["Bambu X1C · B", 41], ["Voron 2.4", 12], ["Elegoo Neptune", 0]];
  const topClients = [...K.clients].sort((a, b) => b.ltv - a.ltv).slice(0, 5);
  const maxLtv = topClients[0].ltv;
  return (
    <CkSec>
      <div className="ck-anldash">
        {/* KPI row */}
        <div className="ck-kpis">
          {K.kpis.map((k) => {
            const up = k.delta >= 0;
            const max = Math.max(...k.spark), min = Math.min(...k.spark);
            return (
              <div key={k.key} className="ck-kpi">
                <div className="lbl">{k.label}</div>
                <div className="val mono">{k.value}<span className="u">{k.unit}</span></div>
                <div className="ck-spark">
                  {k.spark.map((v, i) => (
                    <span key={i} style={{ height: (8 + ((v - min) / (max - min || 1)) * 26) + "px" }}></span>
                  ))}
                </div>
                <div className={"delta mono " + (up ? "up" : "down")}>{up ? "▲" : "▼"} {Math.abs(k.delta)}%</div>
              </div>
            );
          })}
        </div>

        {/* revenue chart */}
        <div className="ck-card ck-span2">
          <div className="ck-cardhead"><h3>Revenue · 12 months</h3><span className="ck-barnote mono">thousand SAR</span></div>
          <div className="ck-revchart">
            {rev.map((v, i) => (
              <div key={i} className="bar">
                <i style={{ height: (v / 31 * 100) + "%", background: i === rev.length - 1 ? "var(--c-print)" : "var(--ink-4)" }}></i>
                <span className="x mono">{months[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* utilisation */}
        <div className="ck-card">
          <div className="ck-cardhead"><h3>Printer utilisation</h3></div>
          <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
            {util.map(([nm, u]) => (
              <div key={nm} className="ck-utilrow">
                <span className="nm">{nm}</span>
                <div className="ck-bar" style={{ flex: 1 }}>
                  <i style={{ width: u + "%", background: u > 70 ? "var(--c-ready)" : u > 30 ? "var(--c-post)" : "var(--c-error)" }}></i>
                </div>
                <span className="mono pct">{u}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* top clients */}
        <div className="ck-card">
          <div className="ck-cardhead"><h3>Top clients · LTV</h3></div>
          <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
            {topClients.map((c) => (
              <div key={c.id} className="ck-utilrow">
                <span className="nm">{c.name}</span>
                <div className="ck-bar" style={{ flex: 1 }}>
                  <i style={{ width: (c.ltv / maxLtv * 100) + "%", background: "var(--c-print)" }}></i>
                </div>
                <span className="mono pct" style={{ width: 56 }}>{SAR(c.ltv)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CkSec>
  );
}

/* =========================================================== CLIENTS */
function CkClients() {
  const initials = (n) => n.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <CkSec bar={
      <>
        <CkChips items={["All", "VAT", "B2C"]} active="All" set={() => {}} />
        <span style={{ flex: 1 }}></span>
        <span className="ck-barnote mono">6 accounts</span>
        <button className="ck-btn quiet sm"><Icon name="plus" size={14} /> Add client</button>
      </>
    }>
      <div className="ck-clientgrid">
        {K.clients.map((c) => (
          <div key={c.id} className="ck-clientcard">
            <div className="top">
              <span className="ck-avatar" style={{ background: c.color }}>{initials(c.name)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{c.name}</div>
                <div className="sub mono">{c.tag} · {c.tier}</div>
              </div>
              {c.balance > 0 && <span className="ck-pill hot">DUE</span>}
            </div>
            <div className="stats">
              <div className="st"><span className="v mono">{c.orders}</span><span className="l">orders</span></div>
              <div className="st"><span className="v mono">{SAR(c.ltv)}</span><span className="l">LTV</span></div>
              <div className="st"><span className="v mono" style={{ color: c.balance > 0 ? "var(--c-error)" : "var(--ink)" }}>{SAR(c.balance)}</span><span className="l">balance</span></div>
            </div>
            <div className="credit">
              <span className="mono">Credit {SAR(c.credit)}</span>
              <div className="ck-bar" style={{ flex: 1 }}>
                <i style={{ width: (c.credit ? Math.min(100, c.balance / c.credit * 100) : 0) + "%", background: "var(--c-post)" }}></i>
              </div>
            </div>
          </div>
        ))}
      </div>
    </CkSec>
  );
}

/* export to window for the shell router */
Object.assign(window, { CkQueue, CkInventory, CkCalculator, CkAnalytics, CkClients });
