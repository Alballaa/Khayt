// vitrine/shell.jsx — Vitrine shell: ambient backdrop, glass sidebar or dock.
const { useState, useEffect } = React;

/* ---------- Tweak defaults ---------- */
const VT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "night",
  "accent": "aurora",
  "nav": "sidebar",
  "glass": 22,
  "density": "regular",
  "rtl": false,
  "proMode": true
}/*EDITMODE-END*/;

// Luminous accents — glass picks up the glow.
const VT_ACCENTS = {
  aurora: { h: 187, s: "80%", l: "60%", on: "#061318", label: "Aurora Cyan" },
  iris:   { h: 262, s: "72%", l: "68%", on: "#120a20", label: "Iris Violet" },
  orchid: { h: 320, s: "65%", l: "64%", on: "#1c0716", label: "Orchid" },
  sunset: { h: 28,  s: "88%", l: "60%", on: "#1c0e03", label: "Sunset Amber" },
};
const VT_DENSITY_U = { compact: 3.7, regular: 4.3, comfy: 4.8 };

/* ---------- Navigation model ---------- */
const VT_NAV = [
  { group: null, items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { group: "Production", items: [
    { id: "queue", label: "Production Queue", icon: "queue", live: true },
    { id: "calculator", label: "Calculator", icon: "calculator" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "catalog", label: "Catalog", icon: "cube" },
    { id: "waste", label: "Waste Log", icon: "waste" },
  ]},
  { group: "Sales", items: [
    { id: "orders", label: "Orders Log", icon: "orders" },
    { id: "clients", label: "Clients", icon: "clients" },
    { id: "gift", label: "Gift Cards", icon: "gift" },
    { id: "portfolio", label: "Portfolio", icon: "portfolio" },
  ]},
  { group: "Business", items: [
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "expenses", label: "Expenses", icon: "expenses", pro: true },
  ]},
];
const VT_TITLES = {
  dashboard: ["Dashboard", "Tuesday · 29 May 2026 · Olaya"],
  queue: ["Production Queue", "6 printers · 18 active orders"],
  calculator: ["Cost Calculator", "Multi-part quote builder"],
  inventory: ["Inventory", "Filament & resin stock"],
  catalog: ["Catalog", "Saved parts & products"],
  waste: ["Waste Log", "Failed prints & scrap"],
  orders: ["Orders Log", "All orders & invoices"],
  clients: ["Clients", "CRM & loyalty"],
  gift: ["Gift Cards", "Store credit & vouchers"],
  portfolio: ["Portfolio", "Showcase gallery"],
  analytics: ["Analytics", "Revenue, machines & P&L"],
  expenses: ["Expenses", "Costs & accounting"],
  settings: ["Settings", "Shop, printers & integrations"],
};

/* ---------- Glass sidebar ---------- */
function VtSidebar({ active, setActive, proMode }) {
  return (
    <aside className="vt-side">
      <div className="vt-brand">
        <div className="vt-mark"><b>خ</b></div>
        <div className="col">
          <span className="name">Khayt</span>
          <span className="sub">خيط · Studio</span>
        </div>
      </div>
      <nav className="vt-nav">
        {VT_NAV.map((sec, i) => (
          <React.Fragment key={i}>
            {sec.group && <div className="eyebrow vt-navhead">{sec.group}</div>}
            {sec.items.filter((it) => !it.pro || proMode).map((it) => (
              <button key={it.id} className={"vt-navitem" + (active === it.id ? " on" : "")}
                onClick={() => setActive(it.id)}>
                <Icon name={it.icon} size={18} />
                <span className="grow" style={{ textAlign: "start" }}>{it.label}</span>
                {it.live && <span className="vt-live" />}
                {it.pro && <span className="vt-protag">Pro</span>}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div style={{ height: 8 }}></div>
        <button className={"vt-navitem" + (active === "settings" ? " on" : "")}
          onClick={() => setActive("settings")}>
          <Icon name="settings" size={18} />
          <span className="grow" style={{ textAlign: "start" }}>Settings</span>
        </button>
      </nav>
      <div className="vt-user">
        <div className="vt-avatar">SA</div>
        <div className="col grow" style={{ lineHeight: 1.2, minWidth: 0 }}>
          <strong style={{ fontSize: 12.5 }}>Sara · Admin</strong>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Riyadh · Olaya</span>
        </div>
        <Icon name="chevright" size={14} style={{ color: "var(--text-muted)" }} />
      </div>
    </aside>
  );
}

/* ---------- Dock ---------- */
function VtDock({ active, setActive, proMode }) {
  return (
    <nav className="vt-dock">
      {VT_NAV.map((sec, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="vt-docksep" />}
          {sec.items.filter((it) => !it.pro || proMode).map((it) => (
            <button key={it.id} className={"vt-dockitem" + (active === it.id ? " on" : "")}
              onClick={() => setActive(it.id)}>
              <Icon name={it.icon} size={19} />
              <span className="vt-tip">{it.label}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
      <span className="vt-docksep" />
      <button className={"vt-dockitem" + (active === "settings" ? " on" : "")}
        onClick={() => setActive("settings")}>
        <Icon name="settings" size={19} />
        <span className="vt-tip">Settings</span>
      </button>
    </nav>
  );
}

/* ---------- Page header ---------- */
function VtHead({ active, proMode, setProMode }) {
  const [title, sub] = VT_TITLES[active] || ["", ""];
  return (
    <div className="vt-head">
      <div className="vt-title-wrap grow">
        <h1 className="vt-title">{title}</h1>
        <span className="vt-sub">{sub}</span>
      </div>
      <div className="vt-search">
        <Icon name="search" size={15} style={{ color: "var(--text-muted)" }} />
        <input placeholder="Search orders, clients, parts…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="seg" style={{ height: 38, alignItems: "center" }}>
        <button className={!proMode ? "on" : ""} onClick={() => setProMode(false)}>Simple</button>
        <button className={proMode ? "on" : ""} onClick={() => setProMode(true)}>Pro</button>
      </div>
      <button className="btn icon subtle vt-bell"><Icon name="bell" size={17} /><span className="vt-bdot" /></button>
      <button className="btn primary"><Icon name="plus" size={16} /> New order</button>
    </div>
  );
}

/* ---------- Placeholder ---------- */
function VtPlaceholder({ id }) {
  const [title] = VT_TITLES[id] || [id, ""];
  const icon = (VT_NAV.flatMap((s) => s.items).find((i) => i.id === id) || { icon: "cube" }).icon;
  return (
    <div className="card fade" style={{ display: "grid", placeItems: "center", minHeight: 420, textAlign: "center" }}>
      <div className="col gap12" style={{ alignItems: "center", maxWidth: 380 }}>
        <div className="khayt-ph-ico"><Icon name={icon} size={26} /></div>
        <h3 style={{ fontSize: 18 }}>{title}</h3>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13 }}>
          This screen carries over from the glass system — same panels, glow and type.
          Tell me to build it out next and I'll flesh out the full workflow.
        </p>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [t, setTweak] = useTweaks(VT_TWEAK_DEFAULTS);
  const [active, setActive] = useState("dashboard");
  const proMode = t.proMode;

  const ac = VT_ACCENTS[t.accent] || VT_ACCENTS.aurora;
  const rootStyle = {
    "--accent-h": ac.h, "--accent-s": ac.s, "--accent-l": ac.l,
    "--on-accent": ac.on,
    "--u": (VT_DENSITY_U[t.density] || 4.3) + "px",
    "--glass": (t.glass ?? 22) + "px",
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme === "day" ? "light" : "dark");
    document.documentElement.setAttribute("dir", t.rtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", t.rtl ? "ar" : "en");
  }, [t.theme, t.rtl]);

  if (active === "expenses" && !proMode) setActive("dashboard");

  const SCREENS = {
    dashboard: window.Dashboard, queue: window.Queue, calculator: window.Calculator,
    inventory: window.Inventory, analytics: window.Analytics, clients: window.Clients,
  };
  const Screen = SCREENS[active];
  const dock = t.nav === "dock";

  return (
    <>
      <div className="vt-app" style={rootStyle} data-screen-label={(VT_TITLES[active] || [active])[0]}>
        <div className="vt-bg"></div>
        {!dock && <VtSidebar active={active} setActive={setActive} proMode={proMode} />}
        <main className="vt-main">
          <VtHead active={active} proMode={proMode} setProMode={(v) => setTweak("proMode", v)} />
          <div className={"vt-scroll" + (dock ? " dockpad" : "")} key={active}>
            {Screen ? <Screen pro={proMode} t={t} /> : <VtPlaceholder id={active} />}
          </div>
        </main>
        {dock && <VtDock active={active} setActive={setActive} proMode={proMode} />}
      </div>

      <TweaksPanel>
        <TweakSection label="Direction" />
        <TweakRadio label="Theme" value={t.theme} options={["night", "day"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent glow" value={`hsl(${ac.h} ${ac.s} ${ac.l})`}
          options={Object.keys(VT_ACCENTS).map((k) => `hsl(${VT_ACCENTS[k].h} ${VT_ACCENTS[k].s} ${VT_ACCENTS[k].l})`)}
          onChange={(v) => {
            const k = Object.keys(VT_ACCENTS).find((kk) => `hsl(${VT_ACCENTS[kk].h} ${VT_ACCENTS[kk].s} ${VT_ACCENTS[kk].l})` === v);
            if (k) setTweak("accent", k);
          }} />
        <TweakSlider label="Glass blur" value={t.glass ?? 22} min={6} max={44} step={1} onChange={(v) => setTweak("glass", v)} />
        <TweakSection label="Navigation & layout" />
        <TweakRadio label="Navigation" value={t.nav} options={["sidebar", "dock"]} onChange={(v) => setTweak("nav", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Internationalisation" />
        <TweakToggle label="Arabic RTL layout" value={t.rtl} onChange={(v) => setTweak("rtl", v)} />
        <TweakToggle label="Professional mode" value={t.proMode} onChange={(v) => setTweak("proMode", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
