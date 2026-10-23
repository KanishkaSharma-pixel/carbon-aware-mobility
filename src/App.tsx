import React, { useEffect, useMemo, useRef, useState } from "react";
import { Settings, Route, Totals, Wallet, Receipt } from "./domain";
import {
  defaults,
  personas,
  facilities,
  SEED,
  MODEL,
  corridors,
} from "./fixtures";
import {
  plan,
  normalWeights,
  forecast,
  dijkstra,
  pathEdges,
  points,
} from "./routing";
import { assumptions, roadTotals, sumTotals, zero } from "./emissions";
import {
  experiment,
  defaultExperiment,
  snapshot,
  Experiment,
} from "./simulation";
import { award, balance, redeem, readLocal } from "./rewards";
import { cacheStatus } from "./adapters";
import { CityMap } from "./Map";
import {Icon,Asset} from "./Icons";
import {PersonaTiles,VehicleTiles,WalletView} from "./Controls";
import {TripHUD} from "./TripHUD";
const money = (n: number) => "$" + n.toFixed(2),
  num = (n: number) => n.toFixed(2),
  uid = () => crypto.randomUUID();
const tabs = [
  "Plan a Journey",
  "City Experiment",
  "Impact & Rewards",
  "How It Works",
];
const features = [
  "Personalised routing",
  "Weighted trade-offs",
  "Congestion forecast",
  "Dynamic load balancing",
  "Park & Ride",
  "Adaptive rerouting",
  "Savings evidence",
  "Rewards",
];
const emptyWallet: Wallet = { receipts: [], transactions: [] };
type Trip = {
  id: string;
  route: Route;
  path: number[];
  index: number;
  baseline: Totals;
  settings: Settings;
  actual: Totals;
  elapsed: Totals;
  proposal?: { path: number[]; totals: Totals; old: Totals };
  events: string[];
  running: boolean;
  completed: boolean;
  cooldown: number;
};
function Button({ children, primary = false, ...props }: any) {
  return (
    <button className={"btn " + (primary ? "primary" : "")} {...props}>
      {children}
    </button>
  );
}
function Stat({ label, value, sub }: any) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
export default function App() {
  const [settings, setSettings] = useState<Settings>(() => {
    const p = readLocal("casm-settings-v1", defaults);
    return {
      ...p,
      weights: normalWeights(
        Array.isArray(p.weights) ? p.weights : defaults.weights,
      ),
      occupancy: Math.max(1, Math.min(6, Number(p.occupancy) || 1)),
      incident: false,
      blockedEdge: undefined,
    };
  });
  const [wallet, setWallet] = useState<Wallet>(() => {
    const w = readLocal("casm-wallet-v1", emptyWallet);
    return Array.isArray(w.receipts) && Array.isArray(w.transactions)
      ? w
      : emptyWallet;
  });
  const [tab, setTab] = useState(0),
    [selected, setSelected] = useState("eco"),
    [previewRoute,setPreviewRoute] = useState<string|null>(null),
    [modal, setModal] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [heat, setHeat] = useState(true),
    [mapMode, setMapMode] = useState("inspect"),
    [expConfig, setExpConfig] = useState(defaultExperiment),
    [exp, setExp] = useState<Experiment | null>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(2),
    [trip, setTrip] = useState<Trip | null>(null),
    [guide, setGuide] = useState(-1),
    [guidePaused, setGuidePaused] = useState(false),
    [pipeline, setPipeline] = useState("Data"),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const latest = useRef<any>({});
  const p = useMemo(() => plan(settings), [settings]);
  const route = p.routes.find((r) => r.id === selected) || p.routes[1],
    recommend = p.ranked.find((r) => r.feasible),
    weights = normalWeights(settings.weights),
    f = forecast(settings, exp?.balanced.allocation);
  latest.current = { trip, settings, p, route, wallet };
  useEffect(() => {
    try {
      localStorage.setItem("casm-settings-v1", JSON.stringify(settings));
    } catch {
      setNotice("Local storage unavailable. Preferences will not persist.");
    }
  }, [settings]);
  useEffect(() => {
    try {
      localStorage.setItem("casm-wallet-v1", JSON.stringify(wallet));
    } catch {
      setNotice("Local storage unavailable. Wallet will not persist.");
    }
  }, [wallet]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!playing || !exp) return;
    const timer = setInterval(
      () =>
        setTime((t) => {
          const next = Math.min(exp.duration, t + speed);
          if (next === exp.duration) setPlaying(false);
          return next;
        }),
      450,
    );
    return () => clearInterval(timer);
  }, [playing, exp, speed]);
  function patch(v: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...v }));
  }
  function persona(name: string) {
    patch({
      persona: name,
      weights: [...personas[name]],
      stepFree: name === "Traveller with mobility requirements",
      walkMax: name === "Traveller with mobility requirements" ? 600 : 1000,
      slopeMax: name === "Traveller with mobility requirements" ? 4 : 10,
      avoidUnknown: name === "Traveller with mobility requirements",
    });
  }
  function complete(t: Trip) {
    const saving = t.baseline.carbon - t.actual.carbon;
    const r: Receipt = {
      id: t.id,
      seed: SEED,
      timestamp: new Date().toISOString(),
      route: t.route.name,
      vehicle: t.settings.vehicle,
      occupancy: t.settings.occupancy,
      baseline: t.baseline,
      actual: t.actual,
      saving,
      points: points(saving),
      settings: t.settings,
      events: [
        ...t.events,
        "Simulated journey completed; receipt and capped reward recorded once.",
      ],
    };
    setWallet((w) => award(w, r));
    setReceipt(r);
    setNotice(`Trip complete. ${r.points} demo points earned.`);
    return {
      ...t,
      index: t.path.length - 1,
      completed: true,
      running: false,
      events: r.events,
    };
  }
  function advance(force = false) {
    const t = latest.current.trip as Trip;
    if (!t || t.completed || (!t.running && !force) || t.proposal) return;
    const n = {
      ...t,
      index: Math.min(t.index + 1, t.path.length - 1),
      cooldown: Math.max(0, t.cooldown - 1),
    };
    setTrip(n.index === n.path.length - 1 ? complete(n) : n);
  }
  useEffect(() => {
    if (!trip?.running || trip.completed) return;
    const timer = setInterval(() => advance(), 1000);
    return () => clearInterval(timer);
  }, [trip?.running, trip?.completed]);
  useEffect(()=>{if(trip?.completed)setModal("Receipt")},[trip?.completed,trip?.id]);
  function start(r = latest.current.route, s = latest.current.settings) {
    const ctx = plan(s);
    if (!r.feasible || !ctx.baseline) {
      setNotice("No feasible route. Review hard accessibility constraints.");
      return;
    }
    setTrip({
      id: uid(),
      route: { ...r },
      path: [...r.path],
      index: 0,
      baseline: { ...ctx.baseline },
      settings: { ...s },
      actual: { ...r },
      elapsed: { ...zero },
      events: [
        `Trip started: ${r.name}. Baseline: ${ctx.baseline.name}, ${num(ctx.baseline.carbon)} kg per passenger.`,
      ],
      running: true,
      completed: false,
      cooldown: 0,
    });
    setModal(null);
    setTab(0);
  }
  function incident(edgeId?: string) {
    const t = latest.current.trip as Trip;
    if (!t || t.completed) {
      setNotice("Start a road journey first, then introduce an incident.");
      return;
    }
    if (t.route.id === "park") {
      setNotice(
        "Use Park & Ride itinerary controls for transit disruptions. Adaptive road rerouting requires a road journey.",
      );
      return;
    }
    if (t.cooldown > 0) {
      setNotice("Advance three nodes before another reroute proposal.");
      return;
    }
    const current = t.path[t.index],
      remaining = t.path.slice(t.index),
      nextEdge = pathEdges(remaining)[0];
    if (!nextEdge) return;
    const blocked = edgeId || nextEdge.id;
    const s = {
      ...t.settings,
      incident: true,
      blockedEdge: blocked,
      origin: current,
    };
    patch({ incident: true, blockedEdge: blocked });
    const proposal = dijkstra(current, t.settings.destination, s);
    const old = roadTotals(pathEdges(remaining), s),
      newTotals = roadTotals(pathEdges(proposal), s);
    const ratio = t.index / Math.max(1, t.path.length - 1);
    const elapsed = { ...t.actual };
    for (const k of [
      "minutes",
      "km",
      "carbon",
      "cost",
      "fuel",
      "energy",
      "idle",
      "rise",
      "congestion",
    ])
      elapsed[k] = t.actual[k] * ratio;
    elapsed.cost +=
      Math.max(0, t.route.cost - roadTotals(t.route.edges, t.settings).cost) *
      (1 - ratio);
    const events = [
      ...t.events,
      `Incident placed on ${blocked}; affected-edge delay increased. Recomputed at node ${current}.`,
    ];
    if (proposal.length < 2 || old.minutes - newTotals.minutes < 0.15) {
      setNotice(
        "No feasible alternative beats the 0.15-minute threshold. Current path retained.",
      );
      setTrip({
        ...t,
        elapsed,
        actual: sumTotals(elapsed, old),
        events: [...events, "No qualifying reroute; constraints preserved."],
        cooldown: 3,
      });
      return;
    }
    setTrip({
      ...t,
      running: false,
      actual: sumTotals(elapsed, old),
      elapsed,
      proposal: { path: proposal, totals: newTotals, old },
      events,
      cooldown: 3,
    });
  }
  function reroute(accept: boolean) {
    const t = latest.current.trip as Trip;
    if (!t?.proposal) return;
    const prop = t.proposal;
    setTrip({
      ...t,
      path: accept ? [...t.path.slice(0, t.index), ...prop.path] : t.path,
      actual: sumTotals(t.elapsed, accept ? prop.totals : prop.old),
      proposal: undefined,
      running: true,
      events: [
        ...t.events,
        accept
          ? `Accepted reroute: ${num(prop.old.minutes - prop.totals.minutes)} min faster; remaining ${num(prop.totals.carbon)} kg.`
          : "Declined reroute: original remaining path retained.",
      ],
      cooldown: 3,
    });
    setNotice(
      accept
        ? "Reroute accepted. Journey and network choice updated."
        : "Original journey retained.",
    );
  }
  function runExperiment(config = expConfig) {
    try {
      const result = experiment(settings, config);
      setExp(result);
      setTime(0);
      setPlaying(true);
      setTab(1);
      setModal(null);
    } catch (e) {
      setNotice(e.message);
    }
  }
  function redemption(label: string, price: number) {
    if (balance(wallet) < price) {
      setNotice(
        `Insufficient points: ${price} required, ${balance(wallet)} available.`,
      );
      return;
    }
    setWallet(redeem(wallet, label, price, uid()));
    setNotice(`${label}: demo voucher created. No monetary value.`);
  }
  function evidence() {
    return {
      modelVersion: MODEL,
      scenarioId: `district-${SEED}`,
      seed: SEED,
      exportedAt: new Date().toISOString(),
      mode: "Simulation mode",
      units: {
        time: "minutes",
        distance: "km",
        emissions: "kg operational proxy per passenger",
        currency: "USD",
        fuel: "litres per vehicle",
        energy: "kWh per vehicle",
      },
      comparisonBasis:
        "Trip estimates per passenger at entered occupancy; city fixed occupancy 1. Baseline = fastest feasible road-only route at trip start with matching inputs.",
      assumptions,
      settings,
      receipts: wallet.receipts,
      transactions: wallet.transactions,
      cityExperiment: exp ? { ...exp, clock: time } : null,
      limitations: [
        "Synthetic 30-node district, not a real city.",
        "Scenario forecast range is ±15% demand, not confidence.",
        "Mesoscopic corridor bottleneck model, not car-following.",
        "Unfinished emissions estimated proportionally to elapsed trip time.",
        "Tailpipe CO2 and electricity/transit CO2e proxies have incomplete, different boundaries.",
        "No audited, certified or automatically reportable reductions.",
      ],
    };
  }
  function download(kind = "json") {
    const data = evidence();
    let text = JSON.stringify(data, null, 2),
      type = "application/json",
      filename = "carbon-mobility-evidence.json";
    if (kind === "csv") {
      const rows = [
        [
          "trip_id",
          "seed",
          "timestamp",
          "vehicle",
          "occupancy",
          "route",
          "baseline_kg_per_passenger",
          "actual_kg_per_passenger",
          "saving_kg",
          "baseline_minutes",
          "actual_minutes",
          "cost_usd",
          "fuel_litres_vehicle",
          "energy_kwh_vehicle",
          "points",
          "model_version",
          "baseline_definition",
          "assumptions_json",
          "limitations",
        ],
        ...wallet.receipts.map((r) => [
          r.id,
          r.seed,
          r.timestamp,
          r.vehicle,
          r.occupancy,
          r.route,
          r.baseline.carbon,
          r.actual.carbon,
          r.saving,
          r.baseline.minutes,
          r.actual.minutes,
          r.actual.cost,
          r.actual.fuel,
          r.actual.energy,
          r.points,
          MODEL,
          data.comparisonBasis,
          JSON.stringify({ ...assumptions, settings: r.settings }),
          data.limitations.join("; "),
        ]),
      ];
      text = rows
        .map((row) =>
          row.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(","),
        )
        .join("\n");
      type = "text/csv";
      filename = "carbon-mobility-trips.csv";
    }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `${filename} exported with units, assumptions and model version.`,
    );
  }
  function explore(i: number) {
    if (i < 3) {
      setTab(0);
      setModal(["Personalise", "Score", "Forecast"][i]);
    }
    if (i === 3) runExperiment();
    if (i === 4) {
      setTab(0);
      setSelected("park");
      setModal("Park & Ride");
    }
    if (i === 5) {
      setTab(0);
      if (!trip || trip.completed) {
        const r = plan(settings).routes[0];
        start(r);
      } else incident();
    }
    if (i === 6) {
      setTab(2);
      setModal(null);
    }
    if (i === 7) {
      setTab(2);
      setModal("Rewards");
    }
  }
  function reset() {
    setSettings({ ...defaults, weights: [...defaults.weights] });
    setWallet(emptyWallet);
    setTrip(null);
    setReceipt(null);
    setExp(null);
    setTime(0);
    setPlaying(false);
    setGuide(-1);
    setModal(null);
    setTab(0);
    setSelected("eco");
    setPreviewRoute(null);
    setMapMode("inspect");
    setExpConfig({ ...defaultExperiment });
    setNotice("Demo reset, including local trip history and wallet.");
  }
  const guideText = [
    "Compare the three route cards; each changes the complete highlighted path.",
    "Student prioritises affordability. Try mobility requirements for hard step-free constraints.",
    "Inspect the real Park & Ride segments, wait, facility choice and access.",
    "Same 1,000 submitted requests; scheduled departures, different allocation policies.",
    "Incident at the next road. Inspect and accept a valid reroute from the current node.",
    "Complete a greener trip, earn points once, and redeem a sample benefit.",
    "Inspect assumptions and export evidence.",
  ];
  function guideAction(i: number) {
    setGuide(i);
    setGuidePaused(false);
    if (i === 0) {
      setTab(0);
      setSelected("fast");
    }
    if (i === 1) {
      persona("Student");
      setModal("Personalise");
    }
    if (i === 2) {
      persona("Traveller with mobility requirements");
      setSelected("park");
      setModal("Park & Ride");
    }
    if (i === 3) runExperiment(defaultExperiment);
    if (i === 4) {
      setPlaying(false);
      const s = {
        ...latest.current.settings,
        stepFree: false,
        slopeMax: 10,
        incident: false,
      };
      patch(s);
      start(plan(s).routes[0], s);
    }
    if (i === 5) {
      const s = { ...defaults };
      patch(s);
      const r = plan(s).routes[2];
      setSelected("park");
      start(r, s);
    }
    if (i === 6) {
      setTab(3);
      setModal(null);
    }
  }
  useEffect(() => {
    if (guide < 0 || guidePaused) return;
    const timers: any[] = [];
    if (guide === 6) timers.push(setTimeout(() => download(), 5000));
    if (guide === 1)
      timers.push(
        setTimeout(() => persona("Traveller with mobility requirements"), 6000),
      );
    if (guide === 4) {
      timers.push(setTimeout(() => incident(), 1800));
      timers.push(
        setTimeout(() => {
          if (latest.current.trip?.proposal) reroute(true);
        }, 6500),
      );
    }
    if (guide === 4)
      for (let j = 0; j < 18; j++)
        timers.push(setTimeout(() => advance(true), 7500 + j * 220));
    if (guide === 5) {
      timers.push(
        setTimeout(() => {
          setTab(2);
          setModal("Rewards");
        }, 12500),
      );
      timers.push(
        setTimeout(() => {
          const w = latest.current.wallet;
          if (balance(w) >= 20) {
            setWallet(redeem(w, "Transit credit", 20, uid()));
            setNotice(
              "Guided demo: 20 points redeemed for a demo-only transit voucher.",
            );
          }
        }, 15000),
      );
    }
    timers.push(
      setTimeout(
        () => {
          if (guide < 6) guideAction(guide + 1);
          else setGuidePaused(true);
        },
        guide === 5 ? 17000 : 12500,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [guide, guidePaused]);
  function prefs() {
    return (
      <>
        <PersonaTiles value={settings.persona} onChange={persona}/>
        <VehicleTiles settings={settings} onChange={patch}/>
        <div className="weights-title">
          <b>Your priorities</b>
          <button className="text-button" onClick={() => setModal("Score")}>
            How scoring works ↗
          </button>
        </div>
        <div className="weight-grid">
          {["Journey time", "Cost", "Emissions", "Reliability"].map(
            (name, i) => (
              <label className="slider" key={name}>
                <span>
                  {name}
                  <b>{Math.round(weights[i] * 100)}%</b>
                </span>
                <input
                  type="range"
                  aria-label={`${name} weight`}
                  min="0"
                  max="100"
                  value={Math.round(settings.weights[i] * 100)}
                  onChange={(e) => {
                    const w = [...settings.weights];
                    w[i] = Number(e.target.value) / 100;
                    patch({ weights: w, persona: "Custom" });
                  }}
                />
              </label>
            ),
          )}
        </div>
        <button
          className="access-button"
          onClick={() => setModal("Accessibility")}
        >
          <span><Icon name="access" size={18}/>Accessibility requirements</span>
          <b>{settings.stepFree ? "On" : "Configure"} →</b>
        </button>
        {settings.vehicle === "EV" && (
          <label className="field">
            Grid intensity · {settings.grid} g/kWh
            <input
              aria-label="Grid intensity"
              type="range"
              min="20"
              max="900"
              step="10"
              value={settings.grid}
              onChange={(e) => patch({ grid: Number(e.target.value) })}
            />
          </label>
        )}
      </>
    );
  }
  function accessControls() {
    return (
      <>
        <p>
          Essential requirements are hard constraints. Unknown access is
          Unverified, never Accessible.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.stepFree}
            onChange={(e) => patch({ stepFree: e.target.checked })}
          />
          Require verified step-free continuity
        </label>
        <label className="field">
          Maximum walking distance · {settings.walkMax} m
          <input
            type="range"
            min="0"
            max="1500"
            step="50"
            value={settings.walkMax}
            onChange={(e) => patch({ walkMax: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Maximum supported slope · {settings.slopeMax}%
          <input
            type="range"
            min="0"
            max="12"
            value={settings.slopeMax}
            onChange={(e) => patch({ slopeMax: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.avoidUnknown}
            onChange={(e) => patch({ avoidUnknown: e.target.checked })}
          />
          Avoid unverified transfers
        </label>
        {p.routes.map((r) => (
          <div className="ledger" key={r.id}>
            <b>{r.name}</b>
            <span>{r.feasible ? r.access : r.reasons.join("; ")}</span>
          </div>
        ))}
      </>
    );
  }
  function parkPanel() {
    const r = p.routes[2],
      facility = facilities[r.facility || 0];
    return (
      <>
        <p>
          Simulated timetable and facility occupancy · departure from origin at
          08:00.
        </p>
        <label className="field">
          Preferred facility
          <select
            value={settings.facility}
            onChange={(e) => patch({ facility: Number(e.target.value) })}
          >
            {facilities.map((f, i) => (
              <option value={i} key={i}>
                {f.name} · {f.occupancy}% occupied
              </option>
            ))}
          </select>
        </label>
        <div className="notice">
          Using {facility.name} · {facility.occupancy}% occupied · {r.walk} m
          walk · {r.facility ? 1 : 0} transfers
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.full}
            onChange={(e) => patch({ full: e.target.checked })}
          />
          Preferred car park full
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.inaccessible}
            onChange={(e) => patch({ inaccessible: e.target.checked })}
          />
          Inaccessible transfer
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.unavailable}
            onChange={(e) => patch({ unavailable: e.target.checked })}
          />
          Transit unavailable
        </label>
        <label className="field">
          Transit delay · {settings.delay} minutes
          <input
            type="range"
            min="0"
            max="20"
            value={settings.delay}
            onChange={(e) => patch({ delay: Number(e.target.value) })}
          />
        </label>
        <div className="itinerary">
          {r.segments.map((seg, i) => (
            <div key={i}>
              <span className="step-number">{i + 1}</span>
              <div>
                <b>{seg.label}</b>
                <small>
                  {seg.access} · {seg.km.toFixed(2)} km
                </small>
              </div>
              <div className="align-right">
                <b>{seg.minutes.toFixed(1)} min</b>
                <small>
                  {num(seg.carbon)} kg · {money(seg.cost)}
                </small>
              </div>
            </div>
          ))}
        </div>
        <p className="notice">
          Door to door {r.minutes.toFixed(1)} min · {num(r.carbon)} kg ·{" "}
          {money(r.cost)} per passenger. Next departure after arrival + park +
          first walk + wait; wait is {r.segments[3].minutes.toFixed(1)} min.
        </p>
        <p>{r.why}</p>
        {!r.feasible && (
          <p className="warning">Unavailable: {r.reasons.join("; ")}</p>
        )}
        <Button
          primary
          disabled={!r.feasible}
          onClick={() => {
            setSelected("park");
            start(r);
          }}
        >
          Start Park & Ride trip
        </Button>
      </>
    );
  }
  function rewardsPanel(){return <WalletView wallet={wallet} onRedeem={redemption}/>}
  function scorePanel() {
    return (
      <>
        <p>
          Lower is better. Min–max normalisation uses the feasible options.
          Identical values normalise to 0. Invalid/zero weights fall back to
          equal weights.
        </p>
        <p className="formula">score = Σ weight × normalised metric</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Actual</th>
                <th>Normal</th>
                <th>Weight</th>
                <th>Product</th>
              </tr>
            </thead>
            <tbody>
              {[
                "Time · min",
                "Cost · USD",
                "Carbon · kg",
                "Congestion index",
              ].map((k, i) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>
                    {[
                      route.minutes,
                      route.cost,
                      route.carbon,
                      route.congestion,
                    ][i].toFixed(2)}
                  </td>
                  <td>{route.normal[i]?.toFixed(3)}</td>
                  <td>{weights[i].toFixed(3)}</td>
                  <td>{(route.normal[i] * weights[i]).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>
          {route.name}: {route.feasible ? route.score.toFixed(3) : "Excluded"}
        </h3>
        {p.ranked.map((r) => (
          <div className="ledger" key={r.id}>
            <b>{r.name}</b>
            <span>
              {r.feasible ? r.score.toFixed(3) : r.reasons.join("; ")}
            </span>
          </div>
        ))}
        <p>
          Elevation/efficiency affect energy, not a redundant optimisation
          penalty. Accessibility filters before ranking.
        </p>
      </>
    );
  }
  function forecastPanel() {
    return (
      <>
        <p>
          Scenario forecast—not validated AI. Demand = corridor input × (1 +
          horizon / 65). The ±15% demand range is not statistical confidence.
        </p>
        <div className="segmented">
          {[0, 10, 20, 30].map((h) => (
            <button
              key={h}
              className={settings.horizon === h ? "active" : ""}
              onClick={() => patch({ horizon: h })}
            >
              {h ? `+${h} min` : "Now"}
            </button>
          ))}
        </div>
        {f.map((x) => (
          <div className="ledger" key={x.row}>
            <div>
              <b>{corridors[x.row]}</b>
              <small>
                Demand {x.demand.toFixed(1)} / capacity {x.capacity.toFixed(1)}{" "}
                veh/min
              </small>
            </div>
            <b>
              {x.low.toFixed(2)}–{x.high.toFixed(2)} × capacity
            </b>
          </div>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.incident}
            onChange={(e) =>
              patch({ incident: e.target.checked, blockedEdge: undefined })
            }
          />
          Central corridor incident
        </label>
        <p>
          {f[1].ratio > 1
            ? "Central demand exceeds capacity; Canopy avoids this bottleneck with a longer distance."
            : "Central demand is within capacity under the current inputs."}
        </p>
      </>
    );
  }
  function receiptPanel(r: Receipt) {
    return (
      <>
        <p className="eyebrow">SIMULATED RECEIPT · {r.id.slice(0, 8)}</p>
        <h3>{r.route}</h3>
        <p>
          {new Date(r.timestamp).toLocaleString()} · {r.vehicle} · {r.occupancy}{" "}
          passenger(s)
        </p>
        <table>
          <thead>
            <tr>
              <th>Metric / passenger</th>
              <th>Baseline</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Operational proxy kg</td>
              <td>{num(r.baseline.carbon)}</td>
              <td>{num(r.actual.carbon)}</td>
            </tr>
            <tr>
              <td>Time · min</td>
              <td>{r.baseline.minutes.toFixed(1)}</td>
              <td>{r.actual.minutes.toFixed(1)}</td>
            </tr>
            <tr>
              <td>Cost · USD</td>
              <td>{money(r.baseline.cost)}</td>
              <td>{money(r.actual.cost)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <b>
            {num(r.saving)} kg estimated saving · {r.points} demo points
          </b>
        </p>
        <p>
          Journey money saved: {money(r.baseline.cost - r.actual.cost)}. Rewards
          have no monetary value and are not double-counted as savings.
        </p>
        <h3>Event log</h3>
        {r.events.map((e, i) => (
          <p className="event" key={i}>
            {e}
          </p>
        ))}
        <Button onClick={() => download()}>Export evidence JSON</Button>
      </>
    );
  }
  function breakdown() {
    return (
      <>
        <h3>{route.name}</h3>
        <p>{route.why}</p>
        <div className="metric-grid">
          <Stat label="Climb approximation" value={`${route.rise} m`} />
          <Stat
            label="Movement adjustment"
            value={`${route.movement.toFixed(3)} ×`}
          />
          <Stat
            label="Idling estimate"
            value={`${route.idle.toFixed(1)} min`}
          />
          <Stat
            label="Vehicle fuel / energy"
            value={
              settings.vehicle === "EV"
                ? `${num(route.energy)} kWh`
                : `${num(route.fuel)} L`
            }
          />
        </div>
        <p>
          Fuel = km × L/100 km × movement + idle min × 0.020 L/min.
          Petrol/hybrid factor 2.31 kg/L; diesel 2.68 kg/L. EV = km × 0.17
          kWh/km × movement + 0.012 kWh/min auxiliary energy.
        </p>
        <p>
          Movement includes climb (capped at 22%), stop/start (capped at 18%)
          and 2.5% stops. Idling added separately; no downhill recovery credit.
        </p>
        <p>{assumptions.boundary}</p>
        <p>
          {assumptions.source}. Fuel $1.65/L; electricity $0.24/kWh; transit
          $0.80/passenger, 0.045 kg/passenger-km; central toll $2.40/vehicle;
          parking $1.00 or $1.60/vehicle.
        </p>
      </>
    );
  }
  function modalBody() {
    if (modal === "Personalise") return prefs();
    if (modal === "Accessibility") return accessControls();
    if (modal === "Score") return scorePanel();
    if (modal === "Park & Ride") return parkPanel();
    if (modal === "Forecast") return forecastPanel();
    if (modal === "Rewards") return rewardsPanel();
    if (modal === "Receipt" && receipt) return receiptPanel(receipt);
    if (modal === "Breakdown") return breakdown();
    if (modal === "Reset demo")
      return (
        <>
          <p>
            This clears local preferences, trip history, demo wallet and
            experiment. Refresh alone keeps completed records.
          </p>
          <Button primary onClick={reset}>
            Confirm reset demo
          </Button>
        </>
      );
    return null;
  }
  return (
    <div className="app">
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab(0);
          }}
        >
          <span className="brand-mark">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <path
                d="M4 24L13 15L24 6M4 15H13L24 6M13 26V17L24 6"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="24" cy="6" r="3" fill="white" />
            </svg>
          </span>
          <span>
            carbon<span className="brand-light">aware</span>
            <small>SMART MOBILITY</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {tabs.map((t, i) => (
            <button
              className={tab === i ? "nav-active" : ""}
              key={t}
              onClick={() => {
                setTab(i);
                setModal(null);
              }}
            >
              <Icon name={["route","city","wallet","layers"][i]} size={19}/>
              {t}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="simulation-badge"><span/>Simulation mode</span>
          <button
            className="avatar"
            aria-label="Open traveller preferences"
            onClick={() => setModal("Personalise")}
          >
            Y
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">BETTER JOURNEYS. A SMARTER NETWORK.</p>
          <h1>
            {
              [
                "Where will you go greener?",
                "One city. Two routing strategies.",
                "Every journey leaves evidence.",
                "No black box. Just clear decisions.",
              ][tab]
            }
          </h1>
        </div>
        <div className="heading-actions">
          <Button
            primary
            disabled={!route.feasible || !!(trip && !trip.completed)}
            onClick={() => start()}
          >
            <Icon name="arrow" size={17}/> Start {route.name} · {route.minutes.toFixed(0)} min
          </Button>
          <Button onClick={() => runExperiment({...expConfig,demand:1000})}><Icon name="city" size={17}/>Run 1,000 drivers</Button>
          <Button onClick={() => guideAction(0)}><Icon name="play" size={16}/>90-second demo</Button>
          <button
            className="text-button"
            onClick={() => setModal("Reset demo")}
          >
            Reset demo
          </button>
        </div>
      </div>
      {guide >= 0 && (
        <section className="guide">
          <div>
            <b>90-second guide · {guide + 1}/7</b>
            <p>{guideText[guide]}</p>
          </div>
          <Button onClick={() => setGuidePaused(!guidePaused)}>
            {guidePaused ? "Resume guide" : "Pause guide"}
          </Button>
          <Button
            onClick={() => (guide < 6 ? guideAction(guide + 1) : setGuide(-1))}
          >
            {guide < 6 ? "Skip to next" : "Finish guide"}
          </Button>
          <button className="text-button" onClick={() => setGuide(-1)}>
            Exit
          </button>
        </section>
      )}
      {tab === 0 && (
        <div className="journey-workspace">
          <div className="planner-layout">
            <aside className="planner-panel">
              <div className="panel-title">
                <h2>Your journey</h2>
                <span className="badge">Today · 08:00</span>
              </div>
              <div className="od-fields">
                <label className="field">
                  A · Origin
                  <select
                    value={settings.origin}
                    onChange={(e) => patch({ origin: Number(e.target.value) })}
                  >
                    {![10, 13, 0].includes(settings.origin) && (
                      <option value={settings.origin}>
                        Road node {settings.origin}
                      </option>
                    )}
                    <option value="10">Westhaven Homes</option>
                    <option value="13">Civic Library</option>
                    <option value="0">Canopy Campus</option>
                  </select>
                </label>
                <label className="field">
                  B · Destination
                  <select
                    value={settings.destination}
                    onChange={(e) =>
                      patch({ destination: Number(e.target.value) })
                    }
                  >
                    {![19, 16, 9].includes(settings.destination) && (
                      <option value={settings.destination}>
                        Road node {settings.destination}
                      </option>
                    )}
                    <option value="19">Eastbank Innovation Park</option>
                    <option value="16">Central Hospital</option>
                    <option value="9">Canopy Station</option>
                  </select>
                </label>
              </div>
              {prefs()}
            </aside>
            <section className="map-workspace">
              <div className="map-toolbar">
                <div>
                  <b>Scenario forecast</b>
                  <span className="muted"> Demand-led · not live traffic</span>
                </div>
                <div className="segmented">
                  {[0, 10, 20, 30].map((h) => (
                    <button
                      key={h}
                      className={settings.horizon === h ? "active" : ""}
                      onClick={() => patch({ horizon: h })}
                    >
                      {h ? `+${h}m` : "Now"}
                    </button>
                  ))}
                </div>
                <button
                  className={"layer-button " + (heat ? "on" : "")}
                  onClick={() => setHeat(!heat)}
                >
                  <Icon name="layers" size={16}/>{heat ? "Heat layer on" : "Heat layer off"}
                </button>
              </div>
              <div className={"map-stage "+(trip?"with-trip":"")}><CityMap
                routes={p.routes}
                selected={trip&&!trip.completed?trip.route.id:selected}
                preview={trip&&!trip.completed?null:previewRoute}
                eligibleEdges={trip&&!trip.completed&&trip.route.id!=="park"?pathEdges(trip.path.slice(trip.index)).map(e=>e.id):[]}
                settings={settings}
                heat={heat}
                onRoute={setSelected}
                onRoad={(id) => {
                  if (mapMode === "incident") {
                    incident(id);
                    setMapMode("inspect");
                  }
                }}
                onNode={(id) => {
                  if (mapMode === "origin" || mapMode === "destination")
                    patch({ [mapMode]: id });
                }}
                onFacility={(id) => {
                  patch({ facility: id });
                  setSelected("park");
                  setModal("Park & Ride");
                }}
                mapMode={mapMode}
                tripPath={trip && !trip.completed ? trip.path : undefined}
                proposalPath={trip?.proposal?.path}
                tripNode={
                  trip && !trip.completed ? trip.path[trip.index] : undefined
                }
              />
              {trip&&<TripHUD trip={trip} onPause={()=>setTrip({...trip,running:!trip.running})} onAdvance={()=>advance(true)} onIncident={()=>incident()} onAccept={()=>reroute(true)} onDecline={()=>reroute(false)} onReceipt={()=>{setReceipt(wallet.receipts.find(r=>r.id===trip.id)||receipt);setModal("Receipt")}} onWallet={()=>setModal("Rewards")}/>}</div>
              <div className="map-interactions">
                <label>
                  Map action{" "}
                  <select
                    aria-label="Map action"
                    value={mapMode}
                    onChange={(e) => setMapMode(e.target.value)}
                  >
                    <option value="inspect">Inspect roads</option>
                    <option value="origin">Set origin node</option>
                    <option value="destination">Set destination node</option>
                    <option value="incident" disabled={!trip||trip.completed||trip.route.id==="park"}>Place trip incident</option>
                  </select>
                </label>
                <span className="map-legend"><i className="legend-line eco"/>Eco road <i className="legend-line fast"/>Fastest <i className="legend-line transit"/>Transit <i className="legend-line walk"/>Walk</span>
              </div>
              <div className="forecast-strip">
                <span className="pulse" />
                <div>
                  <b>
                    {f[1].ratio > 1
                      ? "Central corridor is approaching a bottleneck"
                      : "Central corridor demand is within capacity"}
                  </b>
                  <span>
                    {" "}
                    {settings.horizon?`+${settings.horizon} min`:"Now"} · demand grows ×{(1+settings.horizon/65).toFixed(2)} · central {f[1].demand.toFixed(1)} / {f[1].capacity.toFixed(1)} veh/min · {f[1].low.toFixed(2)}–
                    {f[1].high.toFixed(2)} × capacity · ±15% demand
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("Forecast")}
                >
                  Inspect forecast ↗
                </button>
              </div>
            </section>
          </div>
          <section className="routes-section">
            <div className="section-heading">
              <h2>Three ways. Your priorities.</h2>
              <span>
                Estimates per passenger · {settings.occupancy} people · USD
              </span>
              <button
                className="text-button"
                onClick={() => setModal("Breakdown")}
              >
                Model & breakdown ↗
              </button>
            </div>
            <div className="route-cards">
              {p.routes.map((r) => (
                <button
                  key={r.id}
                  className={
                    "route-card " +
                    (selected === r.id ? "selected" : "") +
                    (!r.feasible ? " infeasible" : "")
                  }
                  style={{ "--route-color": r.color } as any}
                  onClick={() => {
                    setSelected(r.id);
                    if (r.id === "park") setModal("Park & Ride");
                  }}
                  onMouseEnter={()=>setPreviewRoute(r.id)} onMouseLeave={()=>setPreviewRoute(null)} onFocus={()=>setPreviewRoute(r.id)} onBlur={()=>setPreviewRoute(null)}
                  aria-pressed={selected === r.id}
                >
                  <div className="route-card-top">
                    <span className="route-name">
                      <i />
                      {r.name}
                    </span>
                    {recommend?.id === r.id ? (
                      <span className="recommend-tag">Recommended</span>
                    ) : (
                      <span className="route-type">
                        {r.id === "park"
                          ? "DRIVE + TRANSIT"
                          : r.id === "fast"
                            ? "DIRECT · DOTTED"
                            : "LOWER IMPACT · SOLID"}
                      </span>
                    )}
                  </div>
                  <div className="selection-label">{selected===r.id?<><Icon name="check" size={13}/>Your selection</>:<span>Compare this journey</span>}</div>
                  <div className="route-primary">
                    <strong>
                      {r.minutes.toFixed(0)}
                      <small> min</small>
                    </strong>
                    <span>
                      {num(r.carbon)}
                      <small> kg CO₂e proxy</small>
                    </span>
                  </div>
                  <div className="route-secondary">
                    <span>{r.km.toFixed(1)} km</span>
                    <span>{money(r.cost)}</span>
                    <span>+{r.points} pts potential</span>
                  </div>
                  <p>
                    {!r.feasible
                      ? r.reasons.join("; ")
                      : r.id === "fast"
                        ? "Shortest corridor. More stop-start exposure."
                        : r.id === "eco"
                          ? "Gentler climb. Less stop-start. Longer distance."
                          : `${facilities[r.facility || 0].name} · ${r.walk} m walking`}
                  </p>
                  <div className="route-footer">
                    <span>{r.access}</span>
                    <span>Congestion {r.congestion.toFixed(1)} index</span>
                  </div>
                </button>
              ))}
            </div>
            {p.routes[0].path.join(',')===p.routes[1].path.join(',')&&<p className="shared-path-note"><Icon name="info" size={16}/>Fastest and Eco-Balanced currently share the same calculated path. Preferences may still change the overall recommendation.</p>}
            <div className="recommendation">
              <span className="recommend-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M5 19C2 8 13 3 20 4C21 14 15 20 5 19ZM5 19L15 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              <div>
                <b>
                  {recommend
                    ? `${recommend.name} fits your priorities`
                    : "No feasible recommendation"}
                </b>
                <p>
                  {recommend
                    ? `${settings.persona}: lowest feasible weighted score ${recommend.score.toFixed(3)}. ${recommend.why}`
                    : "Mandatory constraints exclude all options. Review access settings; constraints are never silently relaxed."}
                </p>
              </div>
              {recommend&&selected!==recommend.id&&<Button onClick={()=>{setSelected(recommend.id);setPreviewRoute(null)}}>Switch to recommended</Button>}
              <Button
                primary
                disabled={
                  !route.feasible || !p.baseline || !!(trip && !trip.completed)
                }
                onClick={() => start()}
              >
                Start trip · {route.name} · {route.minutes.toFixed(0)} min <Icon name="arrow" size={16}/>
              </Button>
            </div>
          </section>
        </div>
      )}
      {tab === 1 && (
        <section className="experiment-section">
          <div className="experiment-controls">
            <label className="field">
              Requests
              <select
                value={expConfig.demand}
                onChange={(e) =>
                  setExpConfig({ ...expConfig, demand: Number(e.target.value) })
                }
              >
                {[250, 1000, 2000].map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()} drivers
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Participation · {Math.round(expConfig.participation * 100)}%
              <input
                type="range"
                min="0"
                max="100"
                value={expConfig.participation * 100}
                onChange={(e) =>
                  setExpConfig({
                    ...expConfig,
                    participation: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field">
              Acceptance · {Math.round(expConfig.acceptance * 100)}%
              <input
                type="range"
                min="0"
                max="100"
                value={expConfig.acceptance * 100}
                onChange={(e) =>
                  setExpConfig({
                    ...expConfig,
                    acceptance: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field">
              Capacity · {expConfig.capacity.toFixed(1)}×
              <input
                type="range"
                min="40"
                max="160"
                value={expConfig.capacity * 100}
                onChange={(e) =>
                  setExpConfig({
                    ...expConfig,
                    capacity: Number(e.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={expConfig.incident}
                onChange={(e) =>
                  setExpConfig({ ...expConfig, incident: e.target.checked })
                }
              />
              Incident min 8–18
            </label>
            <Button primary onClick={() => runExperiment()}>
              Run {expConfig.demand.toLocaleString()}-driver experiment →
            </Button>
          </div>
          <p className="muted">
            Controls apply on Run. Same seed {SEED}, 10-minute scheduled arrival
            window, vehicle mix, network, constraints, incident and factors.
            Occupancy 1. Road vehicles only; no transit riders included.
          </p>
          {!exp ? (
            <><div className="experiment-state"><span className="state-badge ready">Ready</span><b>Not started</b><span>Run matched requests to begin the comparison.</span></div><div className="scenario-pair ready-pair">{["Independent fastest","Network-balanced"].map((label,i)=><article className="scenario" key={label}><div className="scenario-title"><span className="scenario-letter">{i?'B':'A'}</span><div><h2>{label}</h2><p>Not started · shared seed {SEED}</p></div></div><CityMap settings={settings} compact/><div className="ready-metrics"><Stat label="Completed" value="—"/><Stat label="Queued / travelling" value="—"/><Stat label="Estimated emissions" value="—"/></div></article>)}</div></>
          ) : (
            <>
              <div className="playback"><span className={"state-badge "+(time>=exp.duration?"finished":playing?"running":"paused")}>{time>=exp.duration?"Finished":playing?"Running":time===0?"Ready":"Paused"}</span>
                <Button onClick={() => setPlaying(!playing)}>
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button
                  onClick={() => {
                    setTime(0);
                    setPlaying(false);
                  }}
                >
                  Reset playback
                </Button>
                <label>
                  Speed{" "}
                  <select
                    aria-label="Simulation speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[1, 2, 5, 10].map((x) => (
                      <option key={x} value={x}>
                        {x}×
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  aria-label="Simulation time"
                  type="range"
                  min="0"
                  max={exp.duration}
                  value={time}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(Number(e.target.value));
                  }}
                />
                <b>
                  {time} / {exp.duration} min
                </b>
                <Button
                  onClick={() => {
                    setTime(exp.duration);
                    setPlaying(false);
                  }}
                >
                  Run to completion
                </Button>
              </div>
              <div className="scenario-pair">
                {[exp.baseline, exp.balanced].map((r, i) => {
                  const sn = snapshot(r, time);
                  return (
                    <article className="scenario" key={i}>
                      <div className="scenario-title">
                        <span className="scenario-letter">{i ? "B" : "A"}</span>
                        <div>
                          <h2>
                            {i ? "Network-balanced" : "Independent fastest"}
                          </h2>
                          <p>
                            {i
                              ? "Marginal load + carbon allocation"
                              : "Uncoordinated route requests"}
                          </p>
                        </div>
                      </div>
                      <CityMap
                        settings={{
                          ...settings,
                          incident:
                            exp.config.incident && time >= 8 && time < 18,
                        }}
                        heat
                        compact
                        run={r}
                        cityTime={time}
                        allocation={sn.allocation}
                      />
                      <div className="traffic-counts"><span><b>{sn.queued}</b> queued</span><span><b>{sn.active}</b> travelling</span><span><b>{sn.completed}</b> completed</span><span><b>{sn.notArrived}</b> pending</span></div>
                      <p className="muted particle-note">
                        1 dot ≤10 active drivers; max 20 dots/corridor. Numeric
                        counts exact.
                      </p>
                      <div className="metric-grid">
                        <Stat
                          label="Completed / requested"
                          value={`${sn.completed} / ${exp.config.demand}`}
                        />
                        <Stat
                          label="Unfinished"
                          value={sn.unfinished}
                          sub={`${sn.queued} queued · ${sn.active} travelling · ${sn.notArrived} pending`}
                        />
                        <Stat
                          label="Emitted estimate so far"
                          value={`${sn.emitted.toFixed(1)} kg`}
                          sub="Proportional until completion"
                        />
                        <Stat
                          label="Final mean / p95"
                          value={time===0?"—":`${r.mean.toFixed(1)} / ${r.p95.toFixed(1)} min`}
                          sub="Precomputed across all requests"
                        />
                      </div>
                      <div className="allocation">
                        {sn.allocation.map((n, row) => (
                          <div key={row}>
                            <span>{corridors[row]}</span>
                            <b>
                              {n} / {r.allocation[row]} final
                            </b>
                            <small>
                              {(
                                (r.allocation[row] / exp.config.demand) *
                                100
                              ).toFixed(1)}
                              % final share
                            </small>
                          </div>
                        ))}
                      </div>
                      <details>
                        <summary>Full-run evidence</summary>
                        <p>
                          {r.totals.carbon.toFixed(1)} kg operational proxy ·{" "}
                          {r.fuel.toFixed(1)} L + {r.energy.toFixed(1)} kWh.
                        </p>
                        <p>
                          {r.overCapacity.toFixed(0)} vehicle-minutes over
                          bottleneck capacity; {r.reassigned} diverted from
                          independently fastest corridor.
                        </p>
                        <p>
                          Predicted / realised maximum queue:{" "}
                          {r.predictedQueue.toFixed(1)} /{" "}
                          {r.realisedQueue.toFixed(1)} min.
                        </p>
                      </details>
                    </article>
                  );
                })}
              </div>
              <div className="result-note">
                <h3>
                  {time < exp.duration
                    ? "Projected full-run comparison · unfinished trips remain"
                    : "Completed comparison · every request accounted for"}
                </h3>
                <p>
                  Coordinated routing changes emissions by{" "}
                  {num(exp.balanced.totals.carbon - exp.baseline.totals.carbon)}{" "}
                  kg, mean time by{" "}
                  {(exp.balanced.mean - exp.baseline.mean).toFixed(1)} min and
                  p95 by {(exp.balanced.p95 - exp.baseline.p95).toFixed(1)} min.{" "}
                  {exp.balanced.reassigned} drivers take alternatives. Negative
                  changes are improvements; positive changes are regressions/trade-offs.
                </p>
                <p>
                  Outcome depends on departure concentration, capacities,
                  acceptance, factors and incident. Alternatives may add
                  distance. Not every traveller improves.
                </p>
                <Button onClick={() => download()}>
                  Export experiment evidence
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {tab === 2 && (
        <section className="impact-layout">
          <div>
            <div className="metric-grid impact-stats">
              <Stat label="Completed trips" value={wallet.receipts.length} />
              <Stat
                label="Estimated savings"
                value={`${num(wallet.receipts.reduce((a, r) => a + r.saving, 0))} kg`}
              />
              <Stat
                label="Journey money saved"
                value={money(
                  wallet.receipts.reduce(
                    (a, r) => a + r.baseline.cost - r.actual.cost,
                    0,
                  ),
                )}
              />
              <Stat
                label="Demo wallet"
                value={`${balance(wallet)} pts`}
                sub="No monetary value"
              />
            </div>
            <div className="panel">
              <div className="section-heading">
                <h2>Your journey evidence</h2>
                <Button onClick={() => download("csv")}>Export CSV</Button>
                <Button onClick={() => download()}>Export JSON</Button>
              </div>
              {!wallet.receipts.length ? (
                <div className="empty">
                  <h3>Your first receipt starts with a journey.</h3>
                  <Button primary onClick={() => start()}>
                    Start selected journey
                  </Button>
                </div>
              ) : (
                wallet.receipts.map((r) => (
                  <button
                    className="receipt-row"
                    key={r.id}
                    onClick={() => {
                      setReceipt(r);
                      setModal("Receipt");
                    }}
                  >
                    <div>
                      <b>{r.route}</b>
                      <small>
                        {r.vehicle} · {new Date(r.timestamp).toLocaleString()}
                      </small>
                    </div>
                    <span>{num(r.actual.carbon)} kg</span>
                    <b>{r.points} pts →</b>
                  </button>
                ))
              )}
            </div>
            <div className="panel">
              <h2>Fleet / group view</h2>
              <p>
                Derived from the same local receipts—not a separate inventory.
              </p>
              {["Petrol car", "Diesel car", "Hybrid", "EV"].map((v) => {
                const rs = wallet.receipts.filter((r) => r.vehicle === v);
                return (
                  <div className="ledger" key={v}>
                    <b>{v}</b>
                    <span>
                      {rs.length} trips ·{" "}
                      {num(rs.reduce((a, r) => a + r.actual.carbon, 0))}{" "}
                      kg/passenger-trip sum
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="panel">
              <h2>City experiment evidence</h2>
              <p>
                {exp
                  ? `${exp.config.demand} matched requests. Final totals: ${exp.baseline.totals.carbon.toFixed(1)} kg baseline; ${exp.balanced.totals.carbon.toFixed(1)} kg coordinated. Playback ${time}/${exp.duration} min.`
                  : "No city experiment run yet."}
              </p>
              <Button onClick={() => (exp ? setTab(1) : runExperiment())}>
                Inspect city experiment
              </Button>
            </div>
          </div>
          <aside className="panel wallet-panel">{rewardsPanel()}</aside>
        </section>
      )}
      {tab === 3 && (
        <section className="how-layout">
          <div className="panel pipeline-panel">
            <p className="eyebrow">THE ACTUAL DEMO PIPELINE</p>
            <div className="pipeline">
              {[
                "Data",
                "Forecast",
                "Score",
                "Allocate",
                "Reroute",
                "Reward",
                "Evaluate",
              ].map((s, i) => (
                <button
                  className={pipeline === s ? "active" : ""}
                  key={s}
                  onClick={() => setPipeline(s)}
                >
                  <small>0{i + 1}</small>
                  {s} →
                </button>
              ))}
            </div>
            <h2>{pipeline}</h2>
            {pipeline === "Data" && (
              <>
                <p>
                  30 connected nodes, 35 undirected road links, three corridors,
                  two parking facilities, simulated stop markers and transit
                  timetable.
                </p>
                <p>
                  Static cache: {cacheStatus.staticRoads} roads;{" "}
                  {cacheStatus.vehicleFactors} vehicle factors.{" "}
                  {cacheStatus.dynamic}
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      seed: SEED,
                      model: MODEL,
                      source: "Fixture adapters only",
                      externalConnections: 0,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            )}
            {pipeline === "Forecast" && forecastPanel()}
            {pipeline === "Score" && scorePanel()}
            {pipeline === "Allocate" && (
              <>
                <p>
                  Baseline drivers independently choose the fastest feasible
                  road corridor under common initial estimates. Accepting
                  participants minimise travel time + 1.7 × marginal queue + 1.2
                  × estimated kg + departure-slot utilisation. Road travel
                  factors recompute from bounded volume/capacity using active
                  occupancy and scheduled entries. No fixed split.
                </p>
                <p>
                  FIFO corridor queues enforce per-minute capacities; incident
                  cuts central capacity to 35% during min 8–18.
                  Single-bottleneck approximation, not lane-level traffic.
                </p>
                <Button onClick={() => runExperiment()}>Run allocation</Button>
              </>
            )}
            {pipeline === "Reroute" && (
              <>
                <p>
                  Dijkstra from current node, hard access constraints,
                  0.15-minute minimum benefit, three-node cooldown. Elapsed
                  values use proportional path progress; remaining road factors
                  recompute.
                </p>
                <Button onClick={() => explore(5)}>
                  Open adaptive road journey
                </Button>
              </>
            )}
            {pipeline === "Reward" && rewardsPanel()}
            {pipeline === "Evaluate" && (
              <>
                <p>
                  Receipts snapshot a feasible fastest road-only baseline at
                  departure. Both city scenarios account for all requests, with
                  unfinished counts visible until completion.
                </p>
                <Button onClick={() => download()}>
                  Export complete evidence
                </Button>
              </>
            )}
          </div>
          <aside className="panel">
            <h2>Know your sources</h2>
            {[
              ["Traffic & road network", "Fixture / simulation"],
              ["Elevation", "Fixture; bounded climb adjustment"],
              ["GTFS-style timetable", "Simulated; no external feed"],
              ["Grid carbon", `${settings.grid} g/kWh · scenario input`],
              ["Vehicle telemetry", "Simulated; opt-in concept only"],
            ].map(([a, b]) => (
              <div className="source-row" key={a}>
                <b>{a}</b>
                <span>{b}</span>
              </div>
            ))}
            <label className="field">
              Grid intensity · {settings.grid} g/kWh
              <input
                type="range"
                min="20"
                max="900"
                step="10"
                value={settings.grid}
                onChange={(e) => patch({ grid: Number(e.target.value) })}
              />
            </label>
            <Button
              onClick={() => {
                patch({ vehicle: "EV" });
                setTab(0);
              }}
            >
              Try EV estimates
            </Button>
            <p className="muted">
              Scenario charging suggestion—not live optimisation. No real
              location or telemetry requested.
            </p>
          </aside>
          <div className="panel assumptions">
            <h2>Assumptions, boundaries & limitations</h2>
            <p>
              <b>{assumptions.source}.</b> {assumptions.boundary}
            </p>
            <p>
              Petrol 7.2, diesel 5.8, hybrid 4.3 L/100 km; factors 2.31 kg CO₂/L
              petrol, 2.68 diesel. EV .17 kWh/km + auxiliary energy; grid input{" "}
              {settings.grid} g CO₂e/kWh. Transit .045 kg/passenger-km, walking
              zero operational emissions.
            </p>
            <p>
              USD throughout: fuel $1.65/L, electricity $0.24/kWh, transit
              $0.80/passenger, central toll $2.40/vehicle, parking $1.00/$1.60
              per vehicle. Road cost and emissions divided by occupancy; fares
              remain per passenger. Fuel/energy shown per vehicle.
            </p>
            <p>
              Excluded: {assumptions.excluded} Scenario forecast ±15% demand is
              not validated ML or a confidence interval. The queue experiment is
              a mesoscopic synthetic model, not a transport study.
            </p>
            <p>
              Active trips/experiments restart on refresh to avoid stale state.
              Preferences, completed receipts and wallet persist. No external
              integrations or production deployment are claimed.
            </p>
            <p>
              <b>SDG 11, 12 & 13:</b> sustainable access, resource-aware choices
              and climate-aware planning—not certification, audited ESG,
              verified reductions or automatically reportable Scope 3 savings.
              Model {MODEL} · seed {SEED}.
            </p>
          </div>
        </section>
      )}
      <section className="feature-strip" aria-label="Explore the prototype">
        <div>
          <p className="eyebrow">EXPLORE THE PROTOTYPE</p>
          <b>Eight ideas. Working interactions.</b>
        </div>
        <div className="feature-buttons">
          {features.map((name, i) => (
            <button key={name} onClick={() => explore(i)}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {name} ↗
            </button>
          ))}
        </div>
        <Button primary onClick={() => runExperiment()}>
          Run 1,000-driver experiment →
        </Button>
      </section>
      <footer>
        <span>Carbon-Aware Smart Mobility · {MODEL}</span>
        <span>
          Simulation mode · Estimated operational proxies · Demo rewards
        </span>
        <button
          className="text-button"
          onClick={() => {
            setTab(3);
            setPipeline("Data");
          }}
        >
          Sources & limitations ↗
        </button>
      </footer>
      {modal && (
        <Modal title={modal} onClose={() => setModal(null)}>
          {modalBody()}
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Modal({ title, onClose, children }: any) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input,select,[tabindex="0"],a[href]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
