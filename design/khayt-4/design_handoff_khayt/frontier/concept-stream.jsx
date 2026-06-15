// frontier/concept-stream.jsx — STREAM: conversational ops river.
function StreamConcept() {
  const dots = [
    { c: "#b6ff3d", nm: "Prusa CORE One", v: "67%" },
    { c: "#b6ff3d", nm: "Bambu X1C · A", v: "23%" },
    { c: "#ffb43d", nm: "Saturn 4 Ultra", v: "cure" },
    { c: "#ff6363", nm: "Voron 2.4", v: "fault" },
    { c: "#586352", nm: "Bambu X1C · B", v: "idle" },
    { c: "#586352", nm: "Elegoo Neptune", v: "maint" },
  ];
  return (
    <div className="fr stream">
      {/* ambient sidebar */}
      <div className="ambient">
        <div className="brand">
          <div className="glyph">خ</div>
          <div><b>Stream</b><span>ops feed</span></div>
        </div>
        <div>
          <div className="seclbl" style={{ marginBottom: 8 }}>Fleet pulse</div>
          {dots.map((d) => (
            <div key={d.nm} className="pulse-dot">
              <i style={{ background: d.c, boxShadow: "0 0 8px " + d.c }}></i>
              <span className="nm">{d.nm}</span>
              <span className="v m">{d.v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto" }}>
          <div className="seclbl" style={{ marginBottom: 6 }}>Booked today</div>
          <div className="bignum">3,180<span> SAR</span></div>
        </div>
      </div>

      {/* river */}
      <div className="river">
        <div className="riverhead">
          <h1>Today</h1>
          <p>Khayt is triaging the floor · 4 things need you</p>
        </div>
        <div className="feed">
          <div className="ev alert">
            <div className="av"><Icon name="alert" size={17} /></div>
            <div className="body">
              <div className="who"><b>Khayt</b><span className="t m">13:41</span></div>
              <div className="bubble">
                <span className="hl">Voron 2.4</span> hit thermal runaway mid-print on Coastal drone arms (41% done). I paused the queue behind it.
                <div className="acts">
                  <button className="pri">Restart heater</button>
                  <button>Reassign to Prusa</button>
                  <button>Inspect</button>
                </div>
              </div>
            </div>
          </div>

          <div className="ev you">
            <div className="av"><Icon name="user" size={16} /></div>
            <div className="body">
              <div className="who" style={{ justifyContent: "flex-end" }}><span className="t m">13:42</span><b>You</b></div>
              <div className="bubble">Reassign it to Prusa once the gearbox finishes.</div>
            </div>
          </div>

          <div className="ev">
            <div className="av"><Icon name="check" size={17} /></div>
            <div className="body">
              <div className="who"><b>Khayt</b><span className="t m">13:42</span></div>
              <div className="bubble">
                Done — Coastal drone arms queued on <span className="hl">Prusa CORE One</span> after the gearbox (ETA 16:00). Customer notified of the 2h slip.
              </div>
            </div>
          </div>

          <div className="ev">
            <div className="av"><Icon name="spool" size={16} /></div>
            <div className="body">
              <div className="who"><b>Khayt</b><span className="t m">14:10</span></div>
              <div className="bubble">
                <span className="hl">PETG White</span> dropped below reorder (640 g). I drafted a PO for 2 spools — 164 SAR.
                <div className="acts">
                  <button className="pri">Approve PO</button>
                  <button>Edit</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="composer">
          <Icon name="bolt" size={17} style={{ color: "var(--acc2)" }} />
          <span className="ph">Ask Khayt to do anything — "quote 4× gearbox", "what's late?"…</span>
          <span className="kbd">⌘↵</span>
          <span className="send"><Icon name="arrowup" size={18} /></span>
        </div>
      </div>

      {/* context panel */}
      <div className="context">
        <div>
          <div className="eyebrow">In focus · fault</div>
          <h2>Voron 2.4</h2>
        </div>
        <div className="thumb">live camera</div>
        <div className="card" style={{ padding: "4px 16px" }}>
          <div className="crow"><span className="k">Order</span><span className="v">#1039 · Coastal</span></div>
          <div className="crow"><span className="k">Progress</span><span className="v">41%</span></div>
          <div className="crow"><span className="k">Hotend</span><span className="v" style={{ color: "#ff6363" }}>fault</span></div>
          <div className="crow" style={{ borderBottom: "none" }}><span className="k">Stopped</span><span className="v">13:41</span></div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 9 }}>Suggested</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>
            Thermistor reads erratic — likely a loose hotend connector. Reseat, then re-run a 5-min calibration before resuming.
          </div>
        </div>
      </div>
    </div>
  );
}
window.StreamConcept = StreamConcept;
