// frontier/concept-pulse.jsx — PULSE: command-first, near-chromeless.
function PulseConcept() {
  const [active, setActive] = React.useState(0);
  const results = [
    { ic: "alert", b: "Restart Voron 2.4", s: "Clear thermal fault · resume Coastal drone arms", meta: "stopped 13:41", kbd: "↵" },
    { ic: "calculator", b: "Quote · 4× gearbox housing", s: "PLA Black · ~592 g · 17h", meta: "288 SAR", kbd: "⌥Q" },
    { ic: "spool", b: "Reorder PETG White", s: "640 g left · below 800 g threshold", meta: "draft PO", kbd: "⌥R" },
    { ic: "clock", b: "Prep wash & cure — Saturn 4", s: "finishing in 12 min", meta: "14:55", kbd: "⌥P" },
    { ic: "doc", b: "Send invoice #1043", s: "Najd Robotics · awaiting", meta: "1,240 SAR", kbd: "⌥I" },
  ];
  return (
    <div className="fr pulse">
      <div className="ambient">
        <span><span className="dot"></span><span className="live">LIVE</span></span>
        <span className="m">6 machines</span>
        <span className="m">18 active orders</span>
        <span className="m">73% utilisation</span>
        <span className="m">1 fault</span>
        <span className="right m">⌘K to summon · Olaya studio · 14:33</span>
      </div>

      <div className="ghost">خ</div>
      <svg className="wave" viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path d="M0 60 Q 120 60 180 60 T 320 60 L 360 60 380 18 400 102 420 60 460 60 Q 600 60 720 60 L 760 60 780 30 800 90 820 60 1000 60 T 1440 60"
          fill="none" stroke="#ff5c38" strokeWidth="2" opacity="0.55">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite" />
        </path>
      </svg>

      <div className="stage">
        <div className="kicker">Khayt · Command</div>
        <div className="palette">
          <div className="pbar">
            <span className="promptmark m">⌘</span>
            <span className="typed">restart voron<span className="caret"></span></span>
            <span className="esc m">ESC</span>
          </div>
          <div className="results">
            {results.map((r, i) => (
              <div key={i} className={"res" + (i === active ? " on" : "")} onMouseEnter={() => setActive(i)}>
                <div className="ic"><Icon name={r.ic} size={18} /></div>
                <div className="tx"><b>{r.b}</b><span>{r.s}</span></div>
                <span className="meta m">{r.meta}</span>
                <span className="kbd">{r.kbd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hint">
        <span><kbd>↑↓</kbd>navigate</span>
        <span><kbd>↵</kbd>run</span>
        <span><kbd>⌥</kbd>quick action</span>
        <span><kbd>esc</kbd>dismiss</span>
      </div>
    </div>
  );
}
window.PulseConcept = PulseConcept;
