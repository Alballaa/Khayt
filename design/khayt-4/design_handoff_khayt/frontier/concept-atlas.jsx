// frontier/concept-atlas.jsx — ATLAS: spatial top-down floor map.
const ATLAS_MC = [
  { id: "p1", name: "Prusa CORE One", sub: "FDM · bay A1", status: "print", state: "Printing", prog: 67,
    x: 50, y: 78, job: "Najd — gearbox housing", mat: "PLA Black", temp: "215° / 60°", eta: "1h 48m" },
  { id: "p2", name: "Bambu X1C · A", sub: "FDM · bay A2", status: "print", state: "Printing", prog: 23,
    x: 238, y: 78, job: "Tuwaiq — figurine batch", mat: "PETG White", temp: "220° / 65°", eta: "4h 02m" },
  { id: "p3", name: "Bambu X1C · B", sub: "FDM · bay A3", status: "idle", state: "Idle", prog: 0,
    x: 50, y: 202, job: "—", mat: "—", temp: "28° / 24°", eta: "ready" },
  { id: "p5", name: "Voron 2.4", sub: "FDM · bay A4", status: "error", state: "Stopped", prog: 41,
    x: 238, y: 202, job: "Coastal — drone arms", mat: "ASA Black", temp: "THERMAL RUNAWAY", eta: "—" },
  { id: "p4", name: "Saturn 4 Ultra", sub: "Resin · finishing", status: "post", state: "Wash + cure", prog: 88,
    x: 560, y: 110, job: "Atelier — ring mast", mat: "Resin Grey 8K", temp: "—", eta: "12m" },
  { id: "p6", name: "Elegoo Neptune", sub: "FDM · finishing", status: "idle", state: "Maint", prog: 0,
    x: 560, y: 250, job: "PTFE swap + calibration", mat: "—", temp: "—", eta: "—" },
  { id: "qc", name: "QC Bench", sub: "inspection", status: "idle", state: "2 waiting", prog: 0,
    x: 840, y: 110, job: "#1034 · Atelier Hessa", mat: "—", temp: "—", eta: "—" },
  { id: "ship", name: "Shipping", sub: "dispatch", status: "post", state: "3 to pack", prog: 0,
    x: 840, y: 250, job: "#1032 · Tuwaiq Models", mat: "—", temp: "—", eta: "16:00 pickup" },
];

function AtlasConcept() {
  const [sel, setSel] = React.useState("p1");
  const m = ATLAS_MC.find((x) => x.id === sel) || ATLAS_MC[0];
  const C = 2 * Math.PI * 56;
  const accForStatus = { print: "#b6ff3d", error: "#ff5247", post: "#ffb43d", idle: "#586352" };

  return (
    <div className="fr atlas">
      <div className="topbar">
        <div className="brand">
          <div className="glyph">خ</div>
          <div><b>Atlas</b><span>Olaya floor · live</span></div>
        </div>
        <div className="kpis">
          <div className="kpi"><b>6</b><span>machines</span></div>
          <div className="kpi"><b>73%</b><span>util</span></div>
          <div className="kpi"><b>7</b><span>jobs today</span></div>
        </div>
        <div className="clock m">14:33:09</div>
      </div>

      <div className="floor">
        {/* zones */}
        <div className="zonebox" style={{ left: 30, top: 48, width: 376, height: 290 }}></div>
        <div className="zone" style={{ left: 44, top: 28 }}>Print Farm</div>
        <div className="zonebox" style={{ left: 540, top: 48, width: 230, height: 290 }}></div>
        <div className="zone" style={{ left: 554, top: 28 }}>Finishing</div>
        <div className="zonebox" style={{ left: 824, top: 48, width: 230, height: 290 }}></div>
        <div className="zone" style={{ left: 838, top: 28 }}>QC · Ship</div>

        {/* flow paths + travelling job tokens */}
        <svg className="flow" viewBox="0 0 1100 470" preserveAspectRatio="none">
          <path id="flowA" d="M406 130 C 470 130, 480 175, 540 175" fill="none"
            stroke="rgba(182,255,61,0.28)" strokeWidth="2" strokeDasharray="3 6" />
          <path id="flowB" d="M770 175 C 800 175, 810 175, 824 175" fill="none"
            stroke="rgba(182,255,61,0.28)" strokeWidth="2" strokeDasharray="3 6" />
          <rect width="22" height="22" rx="6" fill="#b6ff3d">
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="0"
              keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href="#flowA" />
            </animateMotion>
          </rect>
          <rect width="18" height="18" rx="5" fill="#ffb43d" opacity="0.9">
            <animateMotion dur="4s" repeatCount="indefinite" begin="1s">
              <mpath href="#flowB" />
            </animateMotion>
          </rect>
        </svg>

        {/* machine stations */}
        {ATLAS_MC.map((p) => (
          <div key={p.id} className={"mc s-" + p.status + (sel === p.id ? " sel" : "")}
            style={{ left: p.x, top: p.y }} onClick={() => setSel(p.id)}>
            <div className="pin"></div>
            <div className="nm">{p.name}</div>
            <div className="sub">{p.sub}</div>
            <div className="state">{p.state}{p.prog ? " · " + p.prog + "%" : ""}</div>
            {p.prog > 0 && <div className="ringbar"><i style={{ width: p.prog + "%" }}></i></div>}
          </div>
        ))}
      </div>

      {/* inspector */}
      <div className="inspector">
        <div>
          <div className="eyebrow">{m.sub}</div>
          <h2>{m.name}</h2>
        </div>
        <div className="ring">
          <svg width="132" height="132">
            <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
            <circle cx="66" cy="66" r="56" fill="none" stroke={accForStatus[m.status]} strokeWidth="9"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - m.prog / 100)} />
          </svg>
          <div className="pctn">
            <b className="m">{m.prog}%</b>
            <span>{m.state}</span>
          </div>
        </div>
        <div>
          <div className="readrow"><span className="k">Current job</span><span className="v">{m.job}</span></div>
          <div className="readrow"><span className="k">Material</span><span className="v">{m.mat}</span></div>
          <div className="readrow"><span className="k">Temps</span><span className="v" style={m.status === "error" ? { color: "#ff5247" } : null}>{m.temp}</span></div>
          <div className="readrow"><span className="k">ETA</span><span className="v">{m.eta}</span></div>
        </div>
        <div className="iact">
          {m.status === "error"
            ? <><button className="pri">Restart</button><button>Reassign job</button></>
            : <><button className="pri">Open job</button><button>Camera</button></>}
        </div>
      </div>
    </div>
  );
}
window.AtlasConcept = AtlasConcept;
