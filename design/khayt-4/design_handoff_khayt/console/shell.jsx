// console/shell.jsx — Control Room shell: command bar, code rail / strip, statusbar.
const { useState, useEffect } = React;

/* ---------- Tweak defaults ---------- */
const CON_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "graphite",
  "signal": "phosphor",
  "nav": "rail",
  "density": "compact",
  "crt": false,
  "rtl": false,
  "proMode": true
}/*EDITMODE-END*/;

// Signal colors — one channel, swappable. Status colors never follow it.
const CON_SIGNALS = {
  phosphor: { h: 135, s: "62%", l: "52%", on: "#07130a", label: "Phosphor Green" },
  amber:    { h: 42,  s: "92%", l: "54%", on: "#171003", label: "Console Amber" },
  cyan:     { h: 187, s: "76%", l: "53%", on: "#04181c", label: "Filament Cyan" },
  white:    { h: 90,  s: "6%",  l: "88%", on: "#141614", label: "Monochrome" },
};
const CON_DENSITY_U = { compact: 3.4, regular: 4, comfy: 4.7 };

/* ---------- Navigation model — 3-letter codes ---------- */
const CON_NAV = [
  { group: null, items: [{ id: "dashboard", code: "DSH", label: "Dashboard", n: "01" }] },
  { group: "PRD", items: [
    { id: "queue", code: "QUE", label: "Production Queue", n: "02", live: true },
    { id: "calculator", code: "CLC", label: "Calculator", n: "03" },
    { id: "inventory", code: "INV", label: "Inventory", n: "04" },
    { id: "catalog", code: "CAT", label: "Catalog", n: "05" },
    { id: "waste", code: "WST", label: "Waste Log", n: "06" },
  ]},
  { group: "SLS", items: [
    { id: "orders", code: "ORD", label: "Orders Log", n: "07" },
    { id: "clients", code: "CLI", label: "Clients", n: "08" },
    { id: "gift", code: "GFT", label: "Gift Cards", n: "09" },
    { id: "portfolio", code: "PRT", label: "Portfolio", n: "10" },
  ]},
  { group: "BIZ", items: [
    { id: "analytics", code: "ANL", label: "Analytics", n: "11" },
    { id: "expenses", code: "EXP", label: "Expenses", n: "12", pro: true },
  ]},
];
const CON_TITLES = {
  dashboard: ["Dashboard", "TUE 29 MAY 2026"],
  queue: ["Production Queue", "6 PRINTERS · 18 ACTIVE"],
  calculator: ["Cost Calculator", "MULTI-PART QUOTE"],
  inventory: ["Inventory", "FILAMENT + RESIN STOCK"],
  catalog: ["Catalog", "SAVED PARTS"],
  waste: ["Waste Log", "FAILS + SCRAP"],
  orders: ["Orders Log", "ORDERS + INVOICES"],
  clients: ["Clients", "CRM + LOYALTY"],
  gift: ["Gift Cards", "STORE CREDIT"],
  portfolio: ["Portfolio", "SHOWCASE"],
  analytics: ["Analytics", "REVENUE · MACHINES · P&L"],
  expenses: ["Expenses", "COSTS + ACCOUNTING"],
  settings: ["Settings", "SHOP + PRINTERS + INTEGRATIONS"],
};
const CON_GROUP_OF = {};
CON_NAV.forEach((s) => s.items.forEach((it) => { CON_GROUP_OF[it.id] = s.group; }));

/* ---------- Command bar ---------- */
function CommandBar({ active, proMode, setProMode }) {
  const group = CON_GROUP_OF[active];
  const item = CON_NAV.flatMap((s) => s.items).find((i) => i.id === active);
  return (
    <header className="con-top">
      <div className="con-brand">
        <div className="con-mark"><b>خ</b></div>
        KHAYT//STUDIO <span className="ver">v3.0</span>
      </div>
      <div className="con-path">
        <span className="sep">≫</span>
        {group && <><span>{group}</span><span className="sep">/</span></>}
        <b>{item ? item.code : active === "settings" ? "SET" : ""}</b>
      </div>
      <div className="grow" />
      <div className="con-search">
        <Icon name="search" size={13} style={{ color: "var(--text-muted)" }} />
        <input placeholder="query orders / clients / parts" />
        <kbd>⌘K</kbd>
      </div>
      <button className="con-pin"><Icon name="pin" size={12} /> OLAYA</button>
      <div className="seg">
        <button className={!proMode ? "on" : ""} onClick={() => setProMode(false)}>Simple</button>
        <button className={proMode ? "on" : ""} onClick={() => setProMode(true)}>Pro</button>
      </div>
      <button className="btn icon sm subtle con-bell" style={{ height: 30, width: 30 }}>
        <Icon name="bell" size={15} /><span className="con-bdot" />
      </button>
      <button className="btn primary" style={{ height: 30 }}><Icon name="plus" size={14} /> New order</button>
    </header>
  );
}

/* ---------- Code rail ---------- */
function CodeRail({ active, setActive, proMode }) {
  return (
    <aside className="con-rail">
      {CON_NAV.map((sec, i) => (
        <React.Fragment key={i}>
          {i > 0 && <hr className="thread" />}
          {sec.items.filter((it) => !it.pro || proMode).map((it) => (
            <button key={it.id} className={"con-railitem" + (active === it.id ? " on" : "")}
              onClick={() => setActive(it.id)} title={it.label}>
              {it.live && <span className="con-livedot" />}
              <span className="num">{it.n}</span>
              <span className="code">{it.code}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
      <div className="grow" />
      <hr className="thread" />
      <button className={"con-railitem" + (active === "settings" ? " on" : "")}
        onClick={() => setActive("settings")} title="Settings">
        <span className="num">13</span>
        <span className="code">SET</span>
      </button>
    </aside>
  );
}

/* ---------- Top code strip ---------- */
function CodeStrip({ active, setActive, proMode }) {
  return (
    <nav className="con-strip">
      {CON_NAV.map((sec, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="gsep" />}
          {sec.items.filter((it) => !it.pro || proMode).map((it) => (
            <button key={it.id} className={"con-stripitem" + (active === it.id ? " on" : "")}
              onClick={() => setActive(it.id)} title={it.label}>
              <span className="num">{it.n}</span>{it.code}
            </button>
          ))}
        </React.Fragment>
      ))}
      <span style={{ marginInlineStart: "auto" }} />
      <button className={"con-stripitem" + (active === "settings" ? " on" : "")}
        onClick={() => setActive("settings")}>
        <span className="num">13</span>SET
      </button>
    </nav>
  );
}

/* ---------- Statusbar ---------- */
function StatusBar({ proMode }) {
  return (
    <footer className="con-status">
      <span className="item"><span className="dot" style={{ background: "var(--ok)" }} /> 3 printing</span>
      <span className="item"><span className="dot" style={{ background: "var(--danger)" }} /> 1 error</span>
      <span className="item"><span className="dot" style={{ background: "var(--text-faint)" }} /> 1 idle · 1 maint</span>
      <span className="item">PETG white low — 640 g</span>
      <span className="grow" />
      <span className="item">{proMode ? "PRO" : "SIMPLE"}</span>
      <span className="item">Olaya · Riyadh</span>
      <span className="item">Tue 29 May 2026 · 14:32</span>
    </footer>
  );
}

/* ---------- Placeholder ---------- */
function ConPlaceholder({ id }) {
  const [title] = CON_TITLES[id] || [id, ""];
  return (
    <div className="card fade" style={{ display: "grid", placeItems: "center", minHeight: 420, textAlign: "center" }}>
      <div className="col gap12" style={{ alignItems: "center", maxWidth: 400 }}>
        <div className="khayt-ph-ico mono" style={{ fontSize: 18, fontWeight: 700 }}>
          {(CON_NAV.flatMap((s) => s.items).find((i) => i.id === id) || { code: "···" }).code}
        </div>
        <h3 style={{ fontSize: 14 }}>{title}</h3>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 12.5, fontFamily: "var(--font-ui)", textTransform: "none" }}>
          This screen carries over from the console system — same command bar, rail, panels and readout type.
          Tell me to build it out next and I'll flesh out the full {title.toLowerCase()} workflow.
        </p>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [t, setTweak] = useTweaks(CON_TWEAK_DEFAULTS);
  const [active, setActive] = useState("dashboard");
  const proMode = t.proMode;

  const sg = CON_SIGNALS[t.signal] || CON_SIGNALS.phosphor;
  const rootStyle = {
    "--accent-h": sg.h, "--accent-s": sg.s, "--accent-l": sg.l,
    "--on-accent": sg.on,
    "--u": (CON_DENSITY_U[t.density] || 3.4) + "px",
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme === "paperwhite" ? "light" : "dark");
    document.documentElement.setAttribute("dir", t.rtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", t.rtl ? "ar" : "en");
  }, [t.theme, t.rtl]);

  if (active === "expenses" && !proMode) setActive("dashboard");

  const SCREENS = {
    dashboard: window.Dashboard, queue: window.Queue, calculator: window.Calculator,
    inventory: window.Inventory, analytics: window.Analytics, clients: window.Clients,
  };
  const Screen = SCREENS[active];
  const [title, sub] = CON_TITLES[active] || ["", ""];
  const strip = t.nav === "strip";

  const main = (
    <main className="con-main">
      <div className="con-pagehead">
        <h1>{title}</h1>
        <span className="con-pagesub">{sub}</span>
      </div>
      <div className="con-scroll" key={active}>
        {Screen ? <Screen pro={proMode} t={t} /> : <ConPlaceholder id={active} />}
      </div>
    </main>
  );

  return (
    <>
      <div className={"con-app" + (t.crt ? " crt" : "")} style={rootStyle}
        data-screen-label={(CON_TITLES[active] || [active])[0]}>
        <CommandBar active={active} proMode={proMode} setProMode={(v) => setTweak("proMode", v)} />
        {strip && <CodeStrip active={active} setActive={setActive} proMode={proMode} />}
        {strip
          ? main
          : <div className="con-body">
              <CodeRail active={active} setActive={setActive} proMode={proMode} />
              {main}
            </div>}
        <StatusBar proMode={proMode} />
      </div>

      <TweaksPanel>
        <TweakSection label="Direction" />
        <TweakRadio label="Theme" value={t.theme} options={["graphite", "paperwhite"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Signal color" value={`hsl(${sg.h} ${sg.s} ${sg.l})`}
          options={Object.keys(CON_SIGNALS).map((k) => `hsl(${CON_SIGNALS[k].h} ${CON_SIGNALS[k].s} ${CON_SIGNALS[k].l})`)}
          onChange={(v) => {
            const k = Object.keys(CON_SIGNALS).find((kk) => `hsl(${CON_SIGNALS[kk].h} ${CON_SIGNALS[kk].s} ${CON_SIGNALS[kk].l})` === v);
            if (k) setTweak("signal", k);
          }} />
        <TweakToggle label="CRT scanlines + glow" value={t.crt} onChange={(v) => setTweak("crt", v)} />
        <TweakSection label="Navigation & layout" />
        <TweakRadio label="Navigation" value={t.nav} options={["rail", "strip"]} onChange={(v) => setTweak("nav", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Internationalisation" />
        <TweakToggle label="Arabic RTL layout" value={t.rtl} onChange={(v) => setTweak("rtl", v)} />
        <TweakToggle label="Professional mode" value={t.proMode} onChange={(v) => setTweak("proMode", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
