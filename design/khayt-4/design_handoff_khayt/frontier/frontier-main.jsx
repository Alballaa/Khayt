// frontier/frontier-main.jsx — assembles the three concepts on a design canvas.
function FrontierApp() {
  return (
    <DesignCanvas>
      <DCSection id="frontier" title="Khayt · Frontier" subtitle="Three completely different operating paradigms — open any one fullscreen (click ⤢)">
        <DCArtboard id="atlas" label="A · Atlas — spatial floor map" width={1440} height={900}>
          <AtlasConcept />
        </DCArtboard>
        <DCArtboard id="pulse" label="B · Pulse — command-first" width={1440} height={900}>
          <PulseConcept />
        </DCArtboard>
        <DCArtboard id="stream" label="C · Stream — conversational ops" width={1440} height={900}>
          <StreamConcept />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<FrontierApp />);
