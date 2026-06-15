// spectrum/spectrum.jsx — Khayt "Spectrum" (Direction G).
// One navigable app, three complete switchable skins (Lumen / Draft / Clay).
// Reuses the section components from sections.jsx (window.CkQueue, etc.).
const { useState, useEffect } = React;

const SK_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "skin": "lumen",
  "rowHeight": 64,
  "rtl": false
}/*EDITMODE-END*/;

const SK_SKINS = [
  { id: "lumen", label: "Lumen", note: "Calm light SaaS" },
  { id: "draft", label: "Draft", note: "Blueprint" },
  { id: "clay",  label: "Clay",  note: "Tactile pastel" },
];

/* ---------- Navigation model ---------- */
const SK_NAV = [
  { id: "dashboard", label: "Overview", icon: "dashboard" },
  { id: "queue", label: "Queue", icon: "queue" },
  { id: "inventory", label: "Inventory", icon: "inventory" },
  { id: "calculator", label: "Calculator", icon: "calculator" },
  { id: "analytics", label: "Analytics", icon: "analytics" },
  { id: "clients", label: "Clients", icon: "clients" },
];
const SK_TITLES = {
  dashboard:  ["Overview", "Tuesday 29 May · Olaya studio"],
  queue:      ["Production Queue", "6 printers · 18 active orders"],
  inventory:  ["Inventory", "8 materials · 1 below reorder"],
  calculator: ["Cost Calculator", "Multi-part quote builder"],
  analytics:  ["Analytics", "Month to date"],
  clients:    ["Clients", "6 accounts · 3 with balance"],
};

/* ---------- Schedule data (mock) — hours decimal, day 8→20 ---------- */
const DAY_START = 8, DAY_END = 20;
const SK_FLEET = [
  { id: "p1", name: "Prusa CORE One", tech: "FDM", status: "printing", job: "Najd — gearbox housing", progress: 67, meta: "215°/60° · ETA 1h 48m",
    blocks: [
      { s: 8.5, e: 11, state: "done", t: "Gearbox lid ×4", sub: "DONE 11:00" },
      { s: 11.5, e: 16, state: "print", t: "Najd — gearbox housing", sub: "67% · ETA 16:00" },
      { s: 16.5, e: 19, state: "queued", t: "Bracket set ×12", sub: "QUEUED" },
    ]},
  { id: "p2", name: "Bambu X1C · A", tech: "FDM", status: "printing", job: "Tuwaiq — figurine batch", progress: 23, meta: "220°/65° · ETA 4h 02m",
    blocks: [
      { s: 9, e: 10.5, state: "done", t: "Sample plates", sub: "DONE 10:30" },
      { s: 13, e: 18, state: "print", t: "Tuwaiq — figurines", sub: "23% · ETA 18:00" },
      { s: 18.25, e: 19.5, state: "queued", t: "Keychain run", sub: "QUEUED" },
    ]},
  { id: "p3", name: "Bambu X1C · B", tech: "FDM", status: "idle", job: null, progress: 0, meta: "28°/24° · ready",
    blocks: [
      { s: 15.5, e: 18, state: "queued", t: "Lattice panels ×6", sub: "NEXT UP" },
    ]},
  { id: "p4", name: "Saturn 4 Ultra", tech: "RESIN", status: "printing", job: "Atelier — ring mast", progress: 88, meta: "ETA 12m",
    blocks: [
      { s: 10, e: 15, state: "print", t: "Atelier — ring mast", sub: "88% · ETA 14:55" },
      { s: 15.25, e: 17, state: "post", t: "Wash & cure", sub: "POST-PROCESS" },
    ]},
  { id: "p5", name: "Voron 2.4", tech: "FDM", status: "error", job: "Coastal — drone arms", progress: 41, meta: "THERMAL RUNAWAY · 13:41",
    blocks: [
      { s: 8, e: 13.7, state: "error", t: "Coastal — drone arms", sub: "STOPPED 13:41" },
    ]},
  { id: "p6", name: "Elegoo Neptune", tech: "FDM", status: "maint", job: null, progress: 0, meta: "PTFE swap + calibration",
    blocks: [
      { s: 12, e: 16, state: "maint", t: "Maintenance", sub: "PTFE + CAL" },
    ]},
];
const NOW = 14.55;

const SK_ST = {
  printing: { c: "var(--c-print)", ink: "#fff", label: "Printing" },
  idle:     { c: "var(--ink-4)", ink: "#fff", label: "Idle" },
  error:    { c: "var(--c-error)", ink: "#fff", label: "Error" },
  maint:    { c: "var(--c-maint)", ink: "#fff", label: "Maint" },
};

const SK_ATTN = [
  { icon: "alert", c: "var(--c-error)", t: "Voron 2.4 stopped — thermal runaway", s: "Order #1039 · 52 min ago", a: "Inspect", hot: true },
  { icon: "spool", c: "var(--c-post)", t: "PETG White below reorder point", s: "640 g left · threshold 800 g", a: "Draft PO" },
  { icon: "clock", c: "var(--c-print)", t: "Saturn 4 finishing in 12 min", s: "Wash & cure station needed", a: "Prep" },
  { icon: "doc", c: "var(--c-ready)", t: "Invoice #1032 paid", s: "Tuwaiq Models · SAR 980", a: "Receipt" },
];
const SK_DUE = [
  { id: "#1042", who: "Najd Robotics", val: "1,240", tag: "TODAY", hot: true },
  { id: "#1040", who: "Atelier Jewelry", val: "860", tag: "TODAY", hot: true },
  { id: "#1036", who: "Tuwaiq Models", val: "980", tag: "TODAY", hot: true },
  { id: "#1044", who: "Coastal UAV", val: "2,150", tag: "THU" },
  { id: "#1045", who: "Walk-in · gift", val: "120", tag: "FRI" },
];

const skPct = (h) => ((h - DAY_START) / (DAY_END - DAY_START)) * 100;
const skHour = (h) => String(h).padStart(2, "0") + ":00";

/* ---------- top bar (with skin switcher) ---------- */
function SkTop({ active, skin, setSkin }) {
  const [title, sub] = SK_TITLES[active] || ["Khayt", ""];
  return (
    <header className="ck-top">
      <div className="ck-mark"><b>خ</b></div>
      <div className="ck-title">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      <div className="grow" style={{ flex: 1 }}></div>
      <div className="sk-skinswitch" title="Switch aesthetic">
        {SK_SKINS.map((s) => (
          <button key={s.id} className={"sk-skinbtn" + (skin === s.id ? " on" : "")}
            onClick={() => setSkin(s.id)} title={s.note}>{s.label}</button>
        ))}
      </div>
      <div className="ck-search">
        <Icon name="search" size={15} style={{ color: "var(--ink-3)" }} />
        <input placeholder="Find anything…" />
        <kbd>⌘K</kbd>
      </div>
      <button className="ck-btn quiet"><Icon name="bell" size={16} /></button>
      <button className="ck-btn primary"><Icon name="plus" size={16} /> New order</button>
    </header>
  );
}

/* ---------- left rail ---------- */
function SkRail({ active, setActive }) {
  return (
    <nav className="ck-rail">
      <div className="ck-rail-items">
        {SK_NAV.map((it) => (
          <button key={it.id} className={"ck-railbtn" + (active === it.id ? " on" : "")}
            onClick={() => setActive(it.id)} title={it.label}>
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <button className="ck-railbtn" title="Settings">
        <Icon name="settings" size={20} />
        <span>Settings</span>
      </button>
    </nav>
  );
}

/* ---------- fleet ---------- */
function SkFleet({ sel, setSel }) {
  const live = SK_FLEET.filter((p) => p.status === "printing").length;
  return (
    <section className="ck-panel">
      <div className="ck-phead">
        <h2>Fleet</h2>
        <span className="n">6 machines</span>
        <span style={{ flex: 1 }}></span>
        <span className="ck-live"></span>
        <span className="n">{live} printing</span>
      </div>
      <div className="ck-pscroll">
        {SK_FLEET.map((p) => {
          const st = SK_ST[p.status];
          const cls = "ck-printer" + (sel === p.id ? " sel" : sel ? " dim" : "");
          return (
            <div key={p.id} className={cls} style={{ "--st": st.c, "--st-ink": st.ink }}
              onClick={() => setSel(sel === p.id ? null : p.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="nm" style={{ flex: 1, minWidth: 0 }}>{p.name}</span>
                <span className="tech">{p.tech}</span>
                <span className="ck-stbadge">{st.label}</span>
              </div>
              <div className="job" style={{ marginTop: 5 }}>{p.job || "No active job"}</div>
              <div className="meta" style={{ margin: "2px 0 8px" }}>{p.meta}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div className="ck-bar" style={{ flex: 1 }}><i style={{ width: p.progress + "%" }}></i></div>
                <span className="mono" style={{ fontSize: 11, fontWeight: 600, width: 32, textAlign: "end" }}>{p.progress}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- timeline ---------- */
function SkTimeline({ sel, setSel, rowH }) {
  const hours = [];
  for (let h = DAY_START; h < DAY_END; h++) hours.push(h);
  return (
    <section className="ck-panel">
      <div className="ck-phead">
        <h2>Today's schedule</h2>
        <span className="n">08:00 — 20:00</span>
        <span style={{ flex: 1 }}></span>
        <span className="n">7 jobs · 2 queued</span>
      </div>
      <div className="ck-legend">
        {[["Printing", "var(--c-print)"], ["Done", "var(--c-done)"], ["Post", "var(--c-post)"], ["Maint", "var(--c-maint)"], ["Error", "var(--c-error)"]].map(([l, c]) => (
          <span key={l} className="li"><span className="sw" style={{ background: c }}></span>{l}</span>
        ))}
        <span className="li"><span className="sw" style={{ border: "1.5px dashed var(--line-soft)", background: "transparent" }}></span>Queued</span>
      </div>
      <div className="ck-tl">
        <div className="ck-tlgrid">
          <div className="ck-hours">
            {hours.map((h) => <span key={h} className="h">{skHour(h)}</span>)}
          </div>
          <div className="ck-rows">
            <div className="ck-vlines">{hours.map((h) => <i key={h}></i>)}</div>
            {SK_FLEET.map((p) => {
              const cls = "ck-row" + (sel === p.id ? " sel" : sel ? " dim" : "");
              return (
                <div key={p.id} className={cls} style={{ height: rowH }} onClick={() => setSel(sel === p.id ? null : p.id)}>
                  {p.blocks.map((b, i) => (
                    <div key={i} className={"ck-block f-" + b.state}
                      style={{ insetInlineStart: skPct(b.s) + "%", width: (skPct(b.e) - skPct(b.s)) + "%" }}
                      title={p.name + " — " + b.t}>
                      <span className="t">{b.t}</span>
                      <span className="s">{b.sub}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="ck-now" style={{ insetInlineStart: skPct(NOW) + "%" }}>
              <span className="chip">14:33</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- feed ---------- */
function SkFeed() {
  return (
    <section className="ck-panel">
      <div className="ck-phead">
        <h2>Attention</h2>
        <span className="n">{SK_ATTN.length}</span>
      </div>
      <div className="ck-pscroll">
        {SK_ATTN.map((a, i) => (
          <div key={i} className={"ck-attn" + (a.hot ? " hot" : "")}>
            <div className="ic" style={{ background: a.c }}><Icon name={a.icon} size={16} /></div>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span className="tt">{a.t}</span>
              <span className="ss">{a.s}</span>
              <button className="act">{a.a}</button>
            </div>
          </div>
        ))}

        <div className="ck-sechead">Due next</div>
        <div style={{ padding: "0 2px" }}>
          {SK_DUE.map((d) => (
            <div key={d.id} className="ck-due">
              <span className="id">{d.id}</span>
              <span className="who" style={{ flex: 1, minWidth: 0 }}>{d.who}</span>
              <span className="val">{d.val}</span>
              <span className="tag" style={{
                background: d.hot ? "var(--c-error)" : "var(--surface-3)",
                color: d.hot ? "#fff" : "var(--ink-2)" }}>{d.tag}</span>
            </div>
          ))}
        </div>

        <div className="ck-sechead">Today so far</div>
        <div className="ck-sum">
          <div className="ck-sumcell"><span className="v">7</span><span className="l">jobs done</span></div>
          <div className="ck-sumcell"><span className="v">4.2 kg</span><span className="l">material</span></div>
          <div className="ck-sumcell"><span className="v">3,180</span><span className="l">SAR booked</span></div>
          <div className="ck-sumcell"><span className="v">180 g</span><span className="l">waste</span></div>
        </div>
      </div>
    </section>
  );
}

function SkDashboard({ sel, setSel, rowH }) {
  return (
    <div className="ck-dash">
      <SkFleet sel={sel} setSel={setSel} />
      <SkTimeline sel={sel} setSel={setSel} rowH={rowH} />
      <SkFeed />
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [t, setTweak] = useTweaks(SK_TWEAK_DEFAULTS);
  const [sel, setSel] = useState(null);
  const [active, setActive] = useState("dashboard");
  const skin = t.skin || "lumen";

  useEffect(() => {
    document.documentElement.setAttribute("data-skin", skin);
    document.documentElement.setAttribute("dir", t.rtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", t.rtl ? "ar" : "en");
  }, [skin, t.rtl]);

  const SECTIONS = {
    queue: window.CkQueue,
    inventory: window.CkInventory,
    calculator: window.CkCalculator,
    analytics: window.CkAnalytics,
    clients: window.CkClients,
  };
  const Section = SECTIONS[active];

  return (
    <>
      <div className="ck-app">
        <SkTop active={active} skin={skin} setSkin={(v) => setTweak("skin", v)} />
        <div className="ck-shell">
          <SkRail active={active} setActive={setActive} />
          <div className="ck-view" key={active + skin} data-screen-label={(SK_TITLES[active] || [""])[0]}>
            {active === "dashboard"
              ? <SkDashboard sel={sel} setSel={setSel} rowH={t.rowHeight || 64} />
              : (Section ? <Section /> : null)}
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Aesthetic" />
        <TweakRadio label="Skin" value={skin} options={SK_SKINS.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setTweak("skin", v)} />
        <TweakSlider label="Timeline row height" value={t.rowHeight || 64} min={48} max={92} step={2} onChange={(v) => setTweak("rowHeight", v)} />
        <TweakSection label="Internationalisation" />
        <TweakToggle label="Arabic RTL layout" value={t.rtl} onChange={(v) => setTweak("rtl", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
