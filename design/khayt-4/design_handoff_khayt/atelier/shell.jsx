// atelier/shell.jsx — Atelier shell: floating sidebar, airy serif page header.
const { useState, useEffect } = React;

/* ---------- Tweak defaults ---------- */
const AT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "gallery",
  "accent": "clay",
  "sidebar": "floating",
  "density": "comfy",
  "uiFont": "Albert Sans",
  "rtl": false,
  "proMode": true
}/*EDITMODE-END*/;

// Muted, gallery-register accents — shared chroma/lightness, hue varies.
const AT_ACCENTS = {
  clay:   { h: 18,  s: "55%", l: "47%", label: "Clay" },
  sage:   { h: 150, s: "28%", l: "40%", label: "Sage" },
  sea:    { h: 196, s: "42%", l: "42%", label: "Sea" },
  violet: { h: 262, s: "32%", l: "50%", label: "Violet" },
};
const AT_DENSITY_U = { compact: 3.8, regular: 4.3, comfy: 4.7 };

/* ---------- Navigation model ---------- */
const AT_NAV = [
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
const AT_TITLES = {
  dashboard: ["Good afternoon, Sara", "Tuesday · 29 May 2026 · Olaya studio"],
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

/* ---------- Sidebar ---------- */
function AtSidebar({ active, setActive, floating, proMode }) {
  return (
    <aside className={"at-side" + (floating ? " floating" : "")}>
      <div className="at-brand">
        <div className="at-mark"><b>خ</b></div>
        <div className="col">
          <span className="name">Khayt</span>
          <span className="sub">خيط · Studio</span>
        </div>
      </div>
      <nav className="at-nav">
        {AT_NAV.map((sec, i) => (
          <React.Fragment key={i}>
            {sec.group && <div className="eyebrow at-navhead">{sec.group}</div>}
            {sec.items.filter((it) => !it.pro || proMode).map((it) => (
              <button key={it.id} className={"at-navitem" + (active === it.id ? " on" : "")}
                onClick={() => setActive(it.id)}>
                <Icon name={it.icon} size={18} />
                <span className="grow" style={{ textAlign: "start" }}>{it.label}</span>
                {it.live && <span className="at-live" />}
                {it.pro && <span className="at-protag">Pro</span>}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div style={{ height: 8 }}></div>
        <button className={"at-navitem" + (active === "settings" ? " on" : "")}
          onClick={() => setActive("settings")}>
          <Icon name="settings" size={18} />
          <span className="grow" style={{ textAlign: "start" }}>Settings</span>
        </button>
      </nav>
      <div className="at-user">
        <div className="at-avatar">SA</div>
        <div className="col grow" style={{ lineHeight: 1.2, minWidth: 0 }}>
          <strong style={{ fontSize: 12.5 }}>Sara · Admin</strong>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Riyadh · Olaya</span>
        </div>
        <Icon name="chevright" size={14} style={{ color: "var(--text-muted)" }} />
      </div>
    </aside>
  );
}

/* ---------- Page header ---------- */
function AtHead({ active, proMode, setProMode }) {
  const [title, sub] = AT_TITLES[active] || ["", ""];
  return (
    <div className="at-head">
      <div className="at-title-wrap grow">
        <h1 className="at-title">{title}</h1>
        <span className="at-sub">{sub}</span>
      </div>
      <div className="at-search">
        <Icon name="search" size={15} style={{ color: "var(--text-muted)" }} />
        <input placeholder="Search anything…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="seg" style={{ height: 40, alignItems: "center" }}>
        <button className={!proMode ? "on" : ""} onClick={() => setProMode(false)}>Simple</button>
        <button className={proMode ? "on" : ""} onClick={() => setProMode(true)}>Pro</button>
      </div>
      <button className="btn icon at-bell"><Icon name="bell" size={17} /><span className="at-bdot" /></button>
      <button className="btn primary lg"><Icon name="plus" size={16} /> New order</button>
    </div>
  );
}

/* ---------- Placeholder ---------- */
function AtPlaceholder({ id }) {
  const [title] = AT_TITLES[id] || [id, ""];
  const icon = (AT_NAV.flatMap((s) => s.items).find((i) => i.id === id) || { icon: "cube" }).icon;
  return (
    <div className="card fade" style={{ display: "grid", placeItems: "center", minHeight: 420, textAlign: "center" }}>
      <div className="col gap12" style={{ alignItems: "center", maxWidth: 380 }}>
        <div className="khayt-ph-ico"><Icon name={icon} size={26} /></div>
        <h3 style={{ fontSize: 20 }}>{title}</h3>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13 }}>
          This screen carries over from the atelier system — same sidebar, cards and type.
          Tell me to build it out next and I'll flesh out the full workflow.
        </p>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [t, setTweak] = useTweaks(AT_TWEAK_DEFAULTS);
  const [active, setActive] = useState("dashboard");
  const proMode = t.proMode;

  const ac = AT_ACCENTS[t.accent] || AT_ACCENTS.clay;
  const rootStyle = {
    "--accent-h": ac.h, "--accent-s": ac.s, "--accent-l": ac.l,
    "--u": (AT_DENSITY_U[t.density] || 4.7) + "px",
    "--font-ui": t.uiFont === "System"
      ? `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      : `"${t.uiFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme === "evening" ? "dark" : "light");
    document.documentElement.setAttribute("dir", t.rtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", t.rtl ? "ar" : "en");
  }, [t.theme, t.rtl]);

  if (active === "expenses" && !proMode) setActive("dashboard");

  const SCREENS = {
    dashboard: window.Dashboard, queue: window.Queue, calculator: window.Calculator,
    inventory: window.Inventory, analytics: window.Analytics, clients: window.Clients,
  };
  const Screen = SCREENS[active];

  return (
    <>
      <div className="at-app" style={rootStyle} data-screen-label={(AT_TITLES[active] || [active])[0]}>
        <AtSidebar active={active} setActive={setActive} floating={t.sidebar === "floating"} proMode={proMode} />
        <main className="at-main">
          <AtHead active={active} proMode={proMode} setProMode={(v) => setTweak("proMode", v)} />
          <div className="at-scroll" key={active}>
            {Screen ? <Screen pro={proMode} t={t} /> : <AtPlaceholder id={active} />}
          </div>
        </main>
      </div>

      <TweaksPanel>
        <TweakSection label="Direction" />
        <TweakRadio label="Theme" value={t.theme} options={["gallery", "evening"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent" value={`hsl(${ac.h} ${ac.s} ${ac.l})`}
          options={Object.keys(AT_ACCENTS).map((k) => `hsl(${AT_ACCENTS[k].h} ${AT_ACCENTS[k].s} ${AT_ACCENTS[k].l})`)}
          onChange={(v) => {
            const k = Object.keys(AT_ACCENTS).find((kk) => `hsl(${AT_ACCENTS[kk].h} ${AT_ACCENTS[kk].s} ${AT_ACCENTS[kk].l})` === v);
            if (k) setTweak("accent", k);
          }} />
        <TweakSection label="Layout" />
        <TweakRadio label="Sidebar" value={t.sidebar} options={["floating", "quiet"]} onChange={(v) => setTweak("sidebar", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakRadio label="UI font" value={t.uiFont} options={["Albert Sans", "IBM Plex Sans", "System"]} onChange={(v) => setTweak("uiFont", v)} />
        <TweakSection label="Internationalisation" />
        <TweakToggle label="Arabic RTL layout" value={t.rtl} onChange={(v) => setTweak("rtl", v)} />
        <TweakToggle label="Professional mode" value={t.proMode} onChange={(v) => setTweak("proMode", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
