# Latest upgrade: real-area planning

Start with **REAL-AREA-SETUP.md** and **START-HERE.txt** for the new geographic planner, private API-key setup, tests and limitations. The earlier documentation below describes the preserved synthetic simulation.

# Carbon-Aware Smart Mobility
**Better journeys. A smarter network.** Runnable, client-side React/TypeScript prototype. No API keys, accounts, tiles, backend, geolocation or telemetry. This is an illustrative simulation, not a transport study.

## Fastest way to try it
Open `Carbon-Aware-Smart-Mobility.html` in a modern browser. Everything is bundled; no installation or internet needed. File-origin localStorage behavior varies by browser; use the local server below for predictable persistence. Use **90-second demo**, or choose a route and press **Start trip**. The HTML is also delivered separately for preview.

## Reproducible local setup
Node 22+ (tested with Node 24), npm. Exact direct dependency versions and package-lock included.
```sh
npm ci
npm run build
npm start
# open http://localhost:4173
```
`dist/` is already built: `node server.mjs` runs it using Node's standard library without npm installation. `PORT=5000 npm start` changes the port. No public deployment is included.
```sh
npm run typecheck
npm test
# in a second terminal, while the server is running:
npx playwright install chromium
CHROMIUM_PATH=/path/to/chromium npm run test:e2e
# rebuild the standalone HTML:
node standalone.mjs
```
The test launcher defaults to `/usr/local/bin/chromium` in the supplied environment. Pass your Chromium path via CHROMIUM_PATH. Playwright browsers must be installed on a new computer for browser tests only; the application itself needs no browser download.

## Implemented interactions
- Four destinations: populated planner, paired city experiment, trip history/rewards, inspectable pipeline.
- Dijkstra on a connected 30-node, 35-link synthetic graph; three road corridors, OD presets and node selection; route selection, pan/zoom, road/facility inspection and offline SVG.
- Four vehicle types, occupancy and EV charging intensity; personas/custom normalised weights; min–max scores; essential access, walking and slope constraints; Unverified data remains explicit.
- Scenario forecasts: Now/+10/+20/+30, demand range and heat layer; incident and allocation inputs.
- Separate Park & Ride itinerary: drive, park, first walk, wait, transit (including transfer when applicable), final walk. Two facilities; full, delay, inaccessible-transfer and unavailable-transit controls. Includes every segment in totals.
- Shared seeded request cohort, independent versus queue-aware road allocation, play/pause/speed/reset, exact queue/active/completed/pending counts; full-run time, p95, emissions, fuel, energy, queue exposure, allocation and diversions.
- Simulated road trip, moving node marker, segment guidance, incident placement, Dijkstra reroute from current node, accept/decline, cooldown, benefit threshold, event log and completion receipt.
- At-most-once local awards, capped points, no negative-saving awards, three demo redemption types, validated balance, persistent vouchers and transactions.
- Trip and same-record fleet/group summaries; JSON full experiment/trip evidence, CSV trip evidence. JSON includes per-driver raw experiment records.
- Guided sequence invokes real controls: compare, personas, itinerary, city run, incident/reroute, completion, greener multimodal trip, local redemption, assumptions/export. Pause/skip/exit are explicit. Guide pause pauses the guide clock, not a separately running trip or experiment.

## Architecture
`src/domain.ts` types; `fixtures.ts` graph/personas/seed; `routing.ts` Dijkstra/access/scoring/forecast; `emissions.ts` shared estimates; `simulation.ts` corridor queues; `rewards.ts` idempotent ledger; `adapters.ts` fixture interfaces/static cache; `Map.tsx` SVG; `App.tsx` central typed application state and screens; `style.css` responsive design/reduced motion. Domain engines do not import UI. Static road/vehicle factors cache in module memory. Dynamic factors recompute. No cloud/edge deployment is claimed.

## Seeded scenario and experiment method
Seed **20261021**, model **CASM-1.0**. Northbank is fictional. Westhaven to Eastbank is the default. 1,000 requests are submitted to the scenario; they are **not** placed on roads simultaneously. Each request's arrival minute is seeded uniformly over integer minutes 0–9. Playback advances a common clock in both runs. Changing controls takes effect on Run.

Both runs share request IDs, arrival schedule, vehicle mix (seeded petrol/diesel/hybrid/EV), access requirements, road capacities, incident schedule, occupancy 1, factors and total run duration. Baseline drivers independently select the fastest feasible initial road corridor. 85% participation and 85% acceptance by default. Coordinated participants minimise route time + 1.7 × marginal predicted queue + 1.2 × kg proxy + departure-slot utilisation. Nonparticipants retain the baseline choice. Splits are computed, never fixed.

FIFO departure slots enforce corridor capacities 46/32/38 veh/min × capacity control. Central capacity drops to 35% during minutes 8–18 if enabled. Occupancy and scheduled entries produce a bounded volume/capacity input (0.6–2.0) for shared road-time/fuel calculations. This is an aggregate single-bottleneck-per-corridor approximation; all corridor entries are scheduled computationally before playback. Queue time is counted, every requested trip completes, and final numbers are labelled precomputed until playback finishes. Animated dots are batched (up to 10 active drivers each, 20-dot corridor cap); exact numeric counts conserve requests. There are no Park & Ride passengers counted as road-experiment vehicles.

## Calculation assumptions
All factors are **Demo assumption—not a validated local factor**. No factor is represented as externally sourced.
- Petrol 7.2 L/100 km × 2.31 kg CO2/L; diesel 5.8 × 2.68; hybrid 4.3 × 2.31. Idling .020 L/min. Fuel = distance × base/100 × movement + idling.
- EV .17 kWh/km × movement plus .012 kWh/min auxiliary load, times scenario grid intensity (default 420 g/kWh).
- Movement = 1 + uphill allowance (max 22%) + stop/start allowance (max 18%) + 2.5% stops. No downhill credit. Road delay = free-flow minutes × .42 × min(12, volume/capacity proxy cubed), with incident edge penalty. Idle is accounted separately, not as a second movement penalty.
- USD: $1.65/L fuel, $.24/kWh electricity, $2.40 central vehicle toll, parking $1.00/$1.60 per vehicle, $.80 transit fare per passenger. Transit .045 kg/passenger-km; walking zero operational emissions.
- Emissions and money are per passenger; driving divides by occupancy, transit fares/factors do not. Fuel/energy remain per vehicle. Time is door-to-door.
- Boundary: combustion **tailpipe CO2**, EV electricity-generation CO2e, transit operational proxy. “CO2e proxy” is shorthand, **not a complete harmonised lifecycle estimate**. Fuel upstream, manufacture/batteries, infrastructure and non-CO2 effects excluded. These are illustrative comparisons, not an emissions inventory.
- Forecast input demand: 26/38/21 veh/min × (1+horizon/65), or the latest experiment's allocated corridor departures/10 × horizon growth. Incident reduces affected corridor capacity. Range varies demand ±15%, not confidence. Forecast and queue experiment use different aggregate resolutions, not a calibrated traffic model.
- Trip baseline: fastest feasible road-only route under the settings at departure, snapshotted for comparison. Saving = baseline minus actual estimate. Points = min(300, floor(max(0, saving kg) × 100)); issued after completion only. Ledger deduplicates trip IDs. Demo vouchers are not money, carbon credits, offsets or partner commitments.

## Known gaps / explicit deviations
This prototype is functional but is **not claimed to pass every detail of the full specification**:
- Uses esbuild + React/TypeScript rather than Vite/Tailwind/Zustand/Framer/Lucide. Central typed React state is in App; it is not a reducer/context architecture. Graph has 30 nodes, within the original 25–40 range, rather than the later plan's 32.
- Mobile uses stacked map-first controls and accessible dialogs rather than a draggable bottom-sheet planner. Full formal WCAG audit and large touch-target coverage are not certified. Smaller secondary/map labels remain.
- Park & Ride uses a simulated fixed service pattern and maps the transit leg to synthetic corridor geometry; there is no independent transit graph. Walking legs are itemised in the itinerary but not separately drawn as off-road geometry. Drive/transit split line styling is simplified.
- Road journeys reroute; Park & Ride disruption controls recompute before departure, not during an active multimodal journey. No arbitrary address search or real city basemap.
- Trips advance one graph node per demo second, not real-time physics. Partial time/emissions are proportional estimates; rerouting snapshots elapsed estimates and recomputes remaining road estimates. A fixed initial toll is treated as paid at departure. Incident effects on a journey's remaining time do not model lane propagation or queues at every intersection.
- The “Fastest” named card is the initial direct expressway candidate, not guaranteed fastest under every later disruption. The actual feasible baseline checks road alternatives. Recommendation can select another route. The queue experiment is not a microscopic or validated model.
- Forecast edge heat reflects aggregate corridor estimates; experiment heat uses queued/scheduled counts. No validated prediction error study. No genuine external traffic, elevation, GTFS, grid, telemetry or accessibility provider.
- Refresh retains stable preferences/history/wallet but intentionally clears active trips and experiment playback. No cross-device persistence, authentication or multi-tab ledger lock. Static manifest included, but no managed Webdev platform/publication was available or claimed.
- CSV exports trip rows only; use JSON for matched city experiment raw evidence. Local browser file-origin storage/download restrictions can vary; local HTTP is the recommended demo path.

## Tests and evidence
`docs/engine-test-results.json` and `docs/e2e-test-results.json` contain actual completed checks. Screenshots and an actual exported receipt are in docs. Engine tests cover graph validity, route trade-offs/ranking, access exclusions, itinerary sums/fallback, occupancy/grid effects, forecasting, seed matching, count conservation at every minute, controls, reroute connectivity and reward dedup/redemption. Browser tests cover selection/personas, Park & Ride, keyboard dialogs, accept/decline, completion/refresh, wallet persistence, export contents, exact experiment completion, pipeline controls, mobile overflow/offline rendering and reduced motion. TypeScript diagnostics and production build must pass. These checks do not constitute formal certification or comprehensive transport-model validation.

## 90-second presentation script
- **0–12s:** “Conventional directions optimise for one driver. This fictional offline district lets us inspect what many choices do to the network.” Compare Fastest, Eco-Balanced and Park & Ride. Select each route.
- **12–25s:** Select Student, then Time-pressed commuter, then mobility requirements. “Weights change ranking. Essential access needs are constraints, not a trade-off score.”
- **25–38s:** Open Park & Ride. Inspect each segment and next wait; toggle preferred parking full. “Door-to-door means parking, walking and waiting count.”
- **38–53s:** Run 1,000 drivers. “Same seeded requests, vehicles and incident. These are scheduled departures, not 1,000 cars appearing at once.” Show queues and allocation, then Run to completion.
- **53–68s:** Start a road trip, pause, Introduce incident, inspect original/proposed remaining path, Accept reroute. “It recalculates from this node and keeps access constraints.” Advance/complete the actual path.
- **68–80s:** Complete a Park & Ride trip if the disrupted road trip has no carbon saving. Open receipt/rewards and redeem transit credit. “Only completed positive savings earn capped points, once. Benefits are demo-only.”
- **80–90s:** Open How It Works and export JSON. “Everything here is estimated and reproducible. No live traffic, validated ML or certified reductions are claimed.”

SDGs 11/12/13 express explanatory alignment only. This application is **Simulated trip guidance—not for real-world navigation**.
