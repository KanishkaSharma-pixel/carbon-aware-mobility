from pathlib import Path
p=Path('src/App.tsx');s=p.read_text()
s=s.replace('import { CityMap } from "./Map";', 'import { CityMap } from "./Map";\nimport {Icon,Asset} from "./Icons";\nimport {PersonaTiles,VehicleTiles,WalletView} from "./Controls";\nimport {TripHUD} from "./TripHUD";')
s=s.replace('[selected, setSelected] = useState("eco"),','[selected, setSelected] = useState("eco"),\n    [previewRoute,setPreviewRoute] = useState<string|null>(null),')
# Change presentation only: same persona and patch callbacks.
a=s.index('        <label className="field">',s.index('  function prefs()'));b=s.index('        <div className="weights-title">',a)
s=s[:a]+'''        <PersonaTiles value={settings.persona} onChange={persona}/>
        <VehicleTiles settings={settings} onChange={patch}/>
'''+s[b:]
s=s.replace('<span>♿ Accessibility requirements</span>','<span><Icon name="access" size={18}/>Accessibility requirements</span>')
a=s.index('  function rewardsPanel()');b=s.index('  function scorePanel()',a)
s=s[:a]+'''  function rewardsPanel(){return <WalletView wallet={wallet} onRedeem={redemption}/>}
'''+s[b:]
# Receipt always derived by existing complete/award functions; auto-open its view.
a=s.index('  function start(')
s=s[:a]+'''  useEffect(()=>{if(trip?.completed)setModal("Receipt")},[trip?.completed,trip?.id]);
'''+s[a:]
s=s.replace('<span className="nav-number">0{i + 1}</span>','<Icon name={["route","city","wallet","layers"][i]} size={19}/>')
s=s.replace('<span className="simulation-badge">● Simulation mode</span>','<span className="simulation-badge"><span/>Simulation mode</span>')
s=s.replace('            Start trip →','            <Icon name="arrow" size={17}/> Start {route.name} · {route.minutes.toFixed(0)} min')
s=s.replace('<Button onClick={() => guideAction(0)}>▷ 90-second demo</Button>','<Button onClick={() => guideAction(0)}><Icon name="play" size={16}/>90-second demo</Button>')
s=s.replace('<Button onClick={() => runExperiment()}>Run 1,000 drivers</Button>','<Button onClick={() => runExperiment({...expConfig,demand:1000})}><Icon name="city" size={17}/>Run 1,000 drivers</Button>')
s=s.replace('      {tab === 0 && (\n        <>','      {tab === 0 && (\n        <div className="journey-workspace">',1)
a=s.index('      {trip && tab === 0 && (');b=s.index('      {tab === 1 && (',a)
s=s[:a]+s[b:]
a=s.index('      {tab === 1 && (');before=s[:a];before=before.rsplit('        </>',1)[0]+'        </div>'+before.rsplit('        </>',1)[1];s=before+s[a:]
# Preview focus/hover, while preserving selected journey state.
s=s.replace('                  aria-pressed={selected === r.id}', '''                  onMouseEnter={()=>setPreviewRoute(r.id)} onMouseLeave={()=>setPreviewRoute(null)} onFocus={()=>setPreviewRoute(r.id)} onBlur={()=>setPreviewRoute(null)}
                  aria-pressed={selected === r.id}''')
s=s.replace('                  <div className="route-primary">','                  <div className="selection-label">{selected===r.id?<><Icon name="check" size={13}/>Your selection</>:<span>Compare this journey</span>}</div>\n                  <div className="route-primary">')
s=s.replace('            <div className="recommendation">','''            {p.routes[0].path.join(',')===p.routes[1].path.join(',')&&<p className="shared-path-note"><Icon name="info" size={16}/>Fastest and Eco-Balanced currently share the same calculated path. Preferences may still change the overall recommendation.</p>}
            <div className="recommendation">''')
s=s.replace('                Start trip · {route.name} →','                Start trip · {route.name} · {route.minutes.toFixed(0)} min <Icon name="arrow" size={16}/>')
s=s.replace('              <Button\n                primary\n                disabled={\n                  !route.feasible || !p.baseline', '''              {recommend&&selected!==recommend.id&&<Button onClick={()=>{setSelected(recommend.id);setPreviewRoute(null)}}>Switch to recommended</Button>}
              <Button
                primary
                disabled={
                  !route.feasible || !p.baseline''')
# Keep actual active path authoritative on the map; preview remains a separate prop.
s=s.replace('              <CityMap\n                routes={p.routes}\n                selected={selected}', '''              <div className={"map-stage "+(trip?"with-trip":"")}><CityMap
                routes={p.routes}
                selected={trip&&!trip.completed?trip.route.id:selected}
                preview={trip&&!trip.completed?null:previewRoute}
                eligibleEdges={trip&&!trip.completed&&trip.route.id!=="park"?pathEdges(trip.path.slice(trip.index)).map(e=>e.id):[]}''')
s=s.replace('              <div className="map-interactions">', '''              {trip&&<TripHUD trip={trip} onPause={()=>setTrip({...trip,running:!trip.running})} onAdvance={()=>advance(true)} onIncident={()=>incident()} onAccept={()=>reroute(true)} onDecline={()=>reroute(false)} onReceipt={()=>{setReceipt(wallet.receipts.find(r=>r.id===trip.id)||receipt);setModal("Receipt")}} onWallet={()=>setModal("Rewards")}/>}</div>
              <div className="map-interactions">''',1)
s=s.replace('                    <option value="incident">Place trip incident</option>', '                    <option value="incident" disabled={!trip||trip.completed||trip.route.id==="park"}>Place trip incident</option>')
s=s.replace('                <span>— Eco road · · Fastest road · – Transit · P Parking</span>','''                <span className="map-legend"><i className="legend-line eco"/>Eco road <i className="legend-line fast"/>Fastest <i className="legend-line transit"/>Transit <i className="legend-line walk"/>Walk</span>''')
s=s.replace('                  ▱ {heat ? "Heat layer on" : "Heat layer off"}', '                  <Icon name="layers" size={16}/>{heat ? "Heat layer on" : "Heat layer off"}')
s=s.replace('                    +{settings.horizon} min scenario · {f[1].low.toFixed(2)}–','                    {settings.horizon?`+${settings.horizon} min`:"Now"} · demand grows ×{(1+settings.horizon/65).toFixed(2)} · central {f[1].demand.toFixed(1)} / {f[1].capacity.toFixed(1)} veh/min · {f[1].low.toFixed(2)}–')
# Ready state shows both maps and undefined metrics, without running the engine.
a=s.index('          {!exp ? (');b=s.index('          ) : (',a)
s=s[:a]+'''          {!exp ? (
            <><div className="experiment-state"><span className="state-badge ready">Ready</span><b>Not started</b><span>Run matched requests to begin the comparison.</span></div><div className="scenario-pair ready-pair">{["Independent fastest","Network-balanced"].map((label,i)=><article className="scenario" key={label}><div className="scenario-title"><span className="scenario-letter">{i?'B':'A'}</span><div><h2>{label}</h2><p>Not started · shared seed {SEED}</p></div></div><CityMap settings={settings} compact/><div className="ready-metrics"><Stat label="Completed" value="—"/><Stat label="Queued / travelling" value="—"/><Stat label="Estimated emissions" value="—"/></div></article>)}</div></>
'''+s[b:]
s=s.replace('              <div className="playback">','''              <div className="playback"><span className={"state-badge "+(time>=exp.duration?"finished":playing?"running":"paused")}>{time>=exp.duration?"Finished":playing?"Running":time===0?"Ready":"Paused"}</span>''')
s=s.replace('                      <p className="muted particle-note">', '''                      <div className="traffic-counts"><span><b>{sn.queued}</b> queued</span><span><b>{sn.active}</b> travelling</span><span><b>{sn.completed}</b> completed</span><span><b>{sn.notArrived}</b> pending</span></div>
                      <p className="muted particle-note">''')
s=s.replace('                          value={`${r.mean.toFixed(1)} / ${r.p95.toFixed(1)} min`}', '                          value={time===0?"—":`${r.mean.toFixed(1)} / ${r.p95.toFixed(1)} min`}')
s=s.replace('                  Negative\n                  changes are improvements; positive changes are trade-offs.', '                  Negative\n                  changes are improvements; positive changes are regressions/trade-offs.')
s=s.replace('                  changes are improvements; positive changes are trade-offs.', '                  changes are improvements; positive changes are regressions/trade-offs.')
# No preview survives reset.
s=s.replace('    setSelected("eco");','    setSelected("eco");\n    setPreviewRoute(null);\n    setMapMode("inspect");')
p.write_text(s)
