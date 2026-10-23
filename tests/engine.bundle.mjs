// src/fixtures.ts
var MODEL = "CASM-1.0";
var SEED = 20261021;
var nodes = Array.from({ length: 30 }, (_, id) => ({ id, row: Math.floor(id / 10), col: id % 10, x: 80 + id % 10 * 84, y: 130 + Math.floor(id / 10) * 150 + Math.sin(id % 10) * 12 }));
var edges = [];
function add(a, b, corridor) {
  const row = nodes[a].row, vertical = nodes[a].col === nodes[b].col;
  edges.push({ id: `${a}-${b}`, a, b, corridor, km: vertical ? 0.44 : [0.78, 0.72, 1.01][row], speed: vertical ? 28 : [39, 62, 43][row], capacity: vertical ? 75 : [46, 32, 38][row], rise: vertical ? 4 : [3, 11, 6][row], accessible: !vertical && row === 2 && nodes[a].col === 4 ? null : !(!vertical && row === 2 && nodes[a].col === 5), slope: row === 2 ? 7 : row === 1 ? 4 : 2 });
}
for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) add(r * 10 + c, r * 10 + c + 1, r);
for (const c of [0, 3, 6, 9]) {
  add(c, c + 10, -1);
  add(c + 10, c + 20, -1);
}
var corridors = ["Canopy Avenue", "Central Expressway", "Riverside Drive"];
var personas = { "Student": [0.15, 0.65, 0.15, 0.05], "Time-pressed commuter": [0.9, 0.02, 0.02, 0.06], "Eco-conscious traveller": [0.1, 0.05, 0.75, 0.1], "Traveller with mobility requirements": [0.3, 0.15, 0.3, 0.25], "Custom": [0.25, 0.25, 0.25, 0.25] };
var defaults = { persona: "Eco-conscious traveller", vehicle: "Petrol car", occupancy: 1, grid: 420, weights: personas["Eco-conscious traveller"], stepFree: false, walkMax: 1e3, slopeMax: 10, avoidUnknown: false, origin: 10, destination: 19, horizon: 20, incident: false, facility: 0, full: false, delay: 0, inaccessible: false, unavailable: false };
var facilities = [{ name: "Canopy Interchange", node: 3, walk: 320, parking: 1, period: 8, ride: 8, occupancy: 72, access: "Verified step-free" }, { name: "Rivergate Hub", node: 23, walk: 580, parking: 1.6, period: 6, ride: 7, occupancy: 48, access: "Unverified" }];
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a += 1831565813;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/emissions.ts
var assumptions = { currency: "USD", fuelPrice: 1.65, electricityPrice: 0.24, transitFare: 0.8, transitKgPerPassengerKm: 0.045, petrolFactor: 2.31, dieselFactor: 2.68, baseLitres: { "Petrol car": 7.2, "Diesel car": 5.8, "Hybrid": 4.3 }, idleLitresPerMinute: 0.02, boundary: "Operational proxy: combustion tailpipe CO2; EV electricity-generation CO2e; transit per-passenger operational proxy. Not a complete lifecycle or strictly harmonised CO2e inventory.", source: "Demo assumption\u2014not a validated local factor", excluded: "Vehicle/battery manufacture, fuel upstream emissions, infrastructure, non-CO2 combustion effects, transit service allocation and induced demand." };
function roadTotals(es, s, load = 1) {
  const km = es.reduce((a, e) => a + e.km, 0), rise = es.reduce((a, e) => a + e.rise, 0);
  let free = 0, idle = 0, congestion = 0;
  for (const e of es) {
    const base = e.km / e.speed * 60;
    const q = (e.corridor === 1 ? 1.12 : e.corridor === 0 ? 0.63 : 0.72) * (1 + s.horizon / 100) * load;
    const factor = s.incident && (!s.blockedEdge ? e.corridor === 1 : e.id === s.blockedEdge) ? 15 : 1;
    free += base;
    idle += base * 0.42 * Math.min(12, Math.pow(q, 3)) * factor;
    congestion += Math.max(0, q - 0.7) * base * factor;
  }
  const movement = 1 + Math.min(0.22, rise / Math.max(1, km) / 180) + Math.min(0.18, congestion / Math.max(1, free) * 0.1) + 0.025;
  const fuel = s.vehicle === "EV" ? 0 : km * assumptions.baseLitres[s.vehicle] / 100 * movement + idle * assumptions.idleLitresPerMinute;
  const energy = s.vehicle === "EV" ? km * 0.17 * movement + (free + idle) * 0.012 : 0;
  const kg = s.vehicle === "EV" ? energy * s.grid / 1e3 : fuel * (s.vehicle === "Diesel car" ? 2.68 : 2.31);
  return { minutes: free + idle, km, carbon: kg / s.occupancy, cost: (fuel * assumptions.fuelPrice + energy * assumptions.electricityPrice) / s.occupancy, fuel, energy, idle, rise, movement, congestion };
}
function sumTotals(a, b) {
  const o = { ...a };
  for (const k of ["minutes", "km", "carbon", "cost", "fuel", "energy", "idle", "rise", "congestion"]) o[k] = a[k] + b[k];
  return o;
}
var zero = { minutes: 0, km: 0, carbon: 0, cost: 0, fuel: 0, energy: 0, idle: 0, rise: 0, movement: 1, congestion: 0 };

// src/routing.ts
function pathEdges(path) {
  return path.slice(1).map((n, i) => edges.find((e) => e.a === n && e.b === path[i] || e.b === n && e.a === path[i])).filter(Boolean);
}
function dijkstra(start, end, s, corridor) {
  const dist = /* @__PURE__ */ new Map([[start, 0]]), prev = /* @__PURE__ */ new Map(), open = new Set(nodes.map((n) => n.id));
  while (open.size) {
    let u = [...open].reduce((a, b) => (dist.get(a) ?? Infinity) < (dist.get(b) ?? Infinity) ? a : b);
    if (!Number.isFinite(dist.get(u))) break;
    open.delete(u);
    if (u === end) break;
    for (const e of edges.filter((e2) => e2.a === u || e2.b === u)) {
      if (corridor !== void 0 && e.corridor !== -1 && e.corridor !== corridor) continue;
      if (s.stepFree && (e.accessible !== true || e.slope > s.slopeMax)) continue;
      if (e.slope > s.slopeMax) continue;
      const v = e.a === u ? e.b : e.a;
      if (!open.has(v)) continue;
      const w = roadTotals([e], s).minutes;
      const nd = dist.get(u) + w;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
      }
    }
  }
  if (!dist.has(end)) return [];
  const path = [end];
  while (path[0] !== start) {
    const p = prev.get(path[0]);
    if (p === void 0) return [];
    path.unshift(p);
  }
  return path;
}
function access(es) {
  return es.some((e) => e.accessible === false) ? "Not step-free" : es.some((e) => e.accessible === null) ? "Unverified" : "Verified step-free";
}
function roadRoute(s, row, id, name, color) {
  const relaxed = { ...s, stepFree: false, slopeMax: 20 };
  const path = dijkstra(s.origin, s.destination, relaxed, row), es = pathEdges(path), t = roadTotals(es, s);
  const reasons = [];
  if (!path.length) reasons.push("Disconnected network");
  if (s.stepFree && access(es) !== "Verified step-free") reasons.push("Step-free continuity not verified");
  if (es.some((e) => e.slope > s.slopeMax)) reasons.push("Road slope exceeds supported maximum");
  return { ...t, cost: t.cost + (row === 1 ? 2.4 / s.occupancy : 0), id, name, color, path, edges: es, feasible: reasons.length === 0, reasons, access: access(es), walk: 0, score: 0, normal: [], points: 0, segments: [], why: row === 1 ? "Direct expressway: shorter distance, but stop-start traffic and a $2.40 vehicle toll." : "Canopy corridor: lower stop-start exposure and gentler elevation, but a longer distance." };
}
function parkRoute(s, index) {
  const f = facilities[index];
  const p = dijkstra(s.origin, f.node, { ...s, stepFree: false, slopeMax: 20 });
  const es = pathEdges(p), drive = roadTotals(es, s), walk = f.walk + (nodes[s.destination].col === 9 ? 180 : 430), walkMin = walk / 75;
  const park = 3, wait = (f.period - (480 + drive.minutes + park + walkMin * 0.65) % f.period) % f.period + s.delay, transitKm = Math.abs(nodes[s.destination].col - 3) * 0.72, ride = Math.max(3, transitKm / 32 * 60), transfer = index ? 2 : 0;
  const segments = [{ label: "Drive", minutes: drive.minutes, km: drive.km, carbon: drive.carbon, cost: drive.cost, access: access(es) }, { label: "Park", minutes: park, km: 0, carbon: 0, cost: f.parking / s.occupancy, access: f.access }, { label: "Walk to platform", minutes: walkMin * 0.65, km: walk * 0.65 / 1e3, carbon: 0, cost: 0, access: f.access }, { label: "Wait", minutes: wait, km: 0, carbon: 0, cost: 0, access: f.access }, { label: transfer ? "Transit + transfer" : "Transit", minutes: ride + transfer, km: transitKm, carbon: transitKm * assumptions.transitKgPerPassengerKm, cost: assumptions.transitFare, access: s.inaccessible ? "Not step-free" : f.access }, { label: "Final walk", minutes: walkMin * 0.35, km: walk * 0.35 / 1e3, carbon: 0, cost: 0, access: "Verified step-free" }];
  const reasons = [];
  if (!p.length) reasons.push("Disconnected road connection");
  if (s.full && index === s.facility) reasons.push("Car park full");
  if (s.unavailable) reasons.push("Transit unavailable");
  if (walk > s.walkMax) reasons.push(`Walking ${walk} m exceeds ${s.walkMax} m limit`);
  if (s.stepFree && (index === 1 || s.inaccessible || access(es) !== "Verified step-free")) reasons.push("Step-free transfer not verified");
  if (s.avoidUnknown && index === 1) reasons.push("Unverified transfer excluded");
  if (es.some((e) => e.slope > s.slopeMax)) reasons.push("Road slope exceeds supported maximum");
  const transitPath = dijkstra(f.node, s.destination, { ...s, stepFree: false, slopeMax: 20 }, index === 0 ? 0 : 2);
  return { ...drive, minutes: segments.reduce((a, b) => a + b.minutes, 0), carbon: segments.reduce((a, b) => a + b.carbon, 0), cost: segments.reduce((a, b) => a + b.cost, 0), km: segments.reduce((a, b) => a + b.km, 0), id: "park", name: "Park & Ride", color: "#2675c7", path: [...p, ...transitPath.slice(1)], edges: es, walk, feasible: reasons.length === 0, reasons, access: index === 1 ? "Unverified" : s.inaccessible ? "Not step-free" : "Verified step-free", score: 0, normal: [], points: 0, segments, facility: index, why: `${f.name}: drive, park and use a simulated transit departure. Includes every door-to-door segment; ${index ? "one transfer" : "no transfers"}.` };
}
function normalWeights(w) {
  const valid = w.map((x) => Number.isFinite(x) && x > 0 ? x : 0), sum = valid.reduce((a, b) => a + b, 0);
  return sum ? valid.map((x) => x / sum) : [0.25, 0.25, 0.25, 0.25];
}
function rank(routes, w) {
  const feasible = routes.filter((r) => r.feasible), weights = normalWeights(w);
  for (const r of routes) {
    r.normal = ["minutes", "cost", "carbon", "congestion"].map((k) => {
      const vals = feasible.map((x) => x[k]), min = Math.min(...vals), max = Math.max(...vals);
      return max > min ? (r[k] - min) / (max - min) : 0;
    });
    r.score = r.feasible ? r.normal.reduce((a, v, i) => a + v * weights[i], 0) : Infinity;
  }
  return [...routes].sort((a, b) => a.score - b.score);
}
function plan(s) {
  const fast = roadRoute(s, 1, "fast", "Fastest", "#cb8837"), eco = roadRoute(s, 0, "eco", "Eco-Balanced", "#09806a");
  let park = parkRoute(s, s.facility);
  if (!park.feasible) {
    const other = parkRoute(s, 1 - s.facility);
    if (other.feasible) park = { ...other, why: `Selected facility unavailable or unsuitable. ${other.why}` };
  }
  const baseline = [fast, eco, roadRoute(s, 2, "river", "Riverside", "#7961a8")].filter((r) => r.feasible).sort((a, b) => a.minutes - b.minutes)[0];
  const routes = [fast, eco, park];
  for (const r of routes) r.points = baseline ? points(baseline.carbon - r.carbon) : 0;
  return { routes, ranked: rank(routes, s.weights), baseline };
}
function points(saving) {
  return Math.min(300, Math.max(0, Math.floor(saving * 100)));
}
function forecast(s, allocated = [0, 0, 0]) {
  return [0, 1, 2].map((row) => {
    const e = edges.find((e2) => e2.corridor === row);
    const total = allocated.reduce((a, b) => a + b, 0);
    const demand = (total > 0 ? allocated[row] / 10 : [26, 38, 21][row]) * (1 + s.horizon / 65);
    const capacity = e.capacity * (s.incident && row === 1 ? 0.4 : 1);
    const ratio = demand / capacity;
    return { row, ratio, low: ratio * 0.85, high: ratio * 1.15, demand, capacity };
  });
}

// src/simulation.ts
function experiment(settings, c) {
  const random = seeded(c.seed);
  const demand = Array.from({ length: c.demand }, (_, id) => ({ id, arrival: Math.floor(random() * 10), vehicle: ["Petrol car", "Diesel car", "Hybrid", "EV"][Math.floor(random() * 4)], participates: random() < c.participation, accepts: random() < c.acceptance })).sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  function run(balanced2) {
    const allocated = [0, 0, 0], slots = [[], [], []], drivers = [];
    let overCapacity = 0, reassigned = 0, realisedQueue = 0, predictedQueue = 0;
    for (const req of demand) {
      let capacity = function(row2, t) {
        return caps[row2] * (c.incident && row2 === 1 && t >= 8 && t < 18 ? 0.35 : 1);
      }, depart = function(row2) {
        let t = req.arrival;
        while ((slots[row2][t] || 0) >= Math.max(1, Math.floor(capacity(row2, t)))) t++;
        return t;
      };
      const s = { ...settings, vehicle: req.vehicle, occupancy: 1, horizon: 0, incident: false };
      const routes = [0, 1, 2].map((row2) => roadRoute(s, row2, `r${row2}`, "", ""));
      const feasible = routes.map((r, i) => r.feasible ? i : -1).filter((i) => i >= 0);
      if (!feasible.length) throw Error("No feasible city corridor. Relax constraints before the experiment.");
      const caps = [46, 32, 38].map((x) => Math.max(1, x * c.capacity));
      const baselineRow = feasible.reduce((a, b) => routes[a].minutes < routes[b].minutes ? a : b);
      let row = baselineRow;
      if (balanced2 && req.participates && req.accepts) {
        row = feasible.reduce((a, b) => {
          const score = (r) => routes[r].minutes + (depart(r) - req.arrival) * 1.7 + routes[r].carbon * 1.2 + (slots[r][depart(r)] || 0) / capacity(r, depart(r));
          return score(a) < score(b) ? a : b;
        });
      }
      const departure = depart(row), wait = departure - req.arrival;
      const active = drivers.filter((d) => d.row === row && d.depart <= departure && d.finish > departure).length;
      const vc = Math.min(2, Math.max(0.6, active / Math.max(1, capacity(row, departure) * routes[row].minutes) + (slots[row][departure] || 0) / capacity(row, departure)));
      const dynamic = roadTotals(routes[row].edges, s, vc);
      const dynamicRoad = { ...routes[row], ...dynamic, cost: dynamic.cost + (row === 1 ? 2.4 : 0) };
      slots[row][departure] = (slots[row][departure] || 0) + 1;
      const total = { ...dynamicRoad, minutes: dynamicRoad.minutes + wait, carbon: dynamicRoad.carbon + wait * 0.02 * (req.vehicle === "Diesel car" ? 2.68 : req.vehicle === "EV" ? 0 : 2.31), fuel: dynamicRoad.fuel + (req.vehicle === "EV" ? 0 : wait * 0.02), energy: dynamicRoad.energy + (req.vehicle === "EV" ? wait * 0.012 : 0), cost: dynamicRoad.cost, idle: dynamicRoad.idle + wait };
      if (req.vehicle === "EV") total.carbon = total.energy * s.grid / 1e3;
      total.cost += req.vehicle === "EV" ? wait * 0.012 * 0.24 : wait * 0.02 * 1.65;
      allocated[row]++;
      if (row !== baselineRow) reassigned++;
      overCapacity += wait;
      realisedQueue = Math.max(realisedQueue, wait);
      const predicted = Math.max(0, allocated[row] / caps[row] - req.arrival);
      predictedQueue = Math.max(predictedQueue, predicted);
      drivers.push({ ...req, row, depart: departure, finish: departure + dynamicRoad.minutes, totals: total, predicted });
    }
    const sorted = drivers.map((d) => d.totals.minutes).sort((a, b) => a - b);
    const totals = drivers.reduce((a, d) => sumTotals(a, d.totals), { ...zero });
    return { drivers, allocation: allocated, totals, mean: totals.minutes / c.demand, p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)], overCapacity, reassigned, fuel: totals.fuel, energy: totals.energy, predictedQueue, realisedQueue };
  }
  const baseline = run(false), balanced = run(true);
  return { config: c, baseline, balanced, seed: c.seed, duration: Math.ceil(Math.max(...baseline.drivers.map((d) => d.finish), ...balanced.drivers.map((d) => d.finish))) };
}
function snapshot(run, t) {
  const arrived = run.drivers.filter((d) => d.arrival <= t), done = arrived.filter((d) => d.finish <= t), active = arrived.filter((d) => d.depart <= t && d.finish > t), queued = arrived.filter((d) => d.depart > t);
  const emitted = arrived.reduce((a, d) => a + d.totals.carbon * Math.min(1, Math.max(0, (t - d.arrival) / d.totals.minutes)), 0);
  return { requested: run.drivers.length, notArrived: run.drivers.length - arrived.length, completed: done.length, active: active.length, queued: queued.length, unfinished: run.drivers.length - done.length, emitted, allocation: [0, 1, 2].map((r) => arrived.filter((d) => d.row === r).length) };
}
var defaultExperiment = { demand: 1e3, participation: 0.85, acceptance: 0.85, incident: true, capacity: 1, seed: SEED };

// src/rewards.ts
function award(w, r) {
  if (w.receipts.some((x) => x.id === r.id)) return w;
  return { receipts: [r, ...w.receipts], transactions: [{ id: "award-" + r.id, type: "Trip reward", points: r.points, timestamp: r.timestamp }, ...w.transactions] };
}
function balance(w) {
  return w.transactions.reduce((a, t) => a + t.points, 0);
}
function redeem(w, label, price, token) {
  if (w.transactions.some((t) => t.id === token)) return w;
  if (balance(w) < price) throw Error(`Insufficient points. ${price} required; ${balance(w)} available.`);
  return { ...w, transactions: [{ id: token, type: label, points: -price, timestamp: (/* @__PURE__ */ new Date()).toISOString(), voucher: "DEMO-" + token.slice(-8).toUpperCase() }, ...w.transactions] };
}
function readLocal(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    if (!s) return fallback;
    const v = JSON.parse(s);
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}

// src/adapters.ts
var staticCache = new Map(edges.map((e) => [e.id, Object.freeze({ ...e })]));
var fixtureAdapters = { traffic: { read: (s) => forecast(s) }, elevation: { metres: (id) => staticCache.get(id)?.rise }, transit: { timetable: () => facilities }, grid: (value) => ({ intensity: () => ({ gPerKwh: value, source: "Configurable scenario input" }) }), telemetry: { read: () => ({ speed: 28, source: "Simulated; opt-in concept only", optIn: false }) } };
var cacheStatus = { staticRoads: staticCache.size, vehicleFactors: 4, dynamic: "Traffic adjustments recomputed when scenario inputs change; immutable road fixtures cached in module memory. No cloud or edge deployment." };
export {
  MODEL,
  SEED,
  assumptions,
  award,
  balance,
  cacheStatus,
  corridors,
  defaultExperiment,
  defaults,
  dijkstra,
  edges,
  experiment,
  facilities,
  fixtureAdapters,
  forecast,
  nodes,
  normalWeights,
  parkRoute,
  pathEdges,
  personas,
  plan,
  points,
  rank,
  readLocal,
  redeem,
  roadRoute,
  roadTotals,
  seeded,
  snapshot,
  sumTotals,
  zero
};
