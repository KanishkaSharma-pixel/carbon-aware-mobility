# Real-area planner upgrade

## Quick start (production build included)
Install Node.js 24 if needed. Open a terminal in this folder.

1. Make a private `.env` file by copying `.env.example`.
2. Put your **openrouteservice** key in it:

```env
ORS_API_KEY=your_private_key
PORT=4173
```

3. Run `npm start`, then open **http://localhost:4173**.
4. Select **Real-area planner** in the experience selector.
5. Enter real origin/destination names and latitude/longitude, or use the map placement controls. Names are your labels, not geocoder-verified addresses. Map tools and coordinate fields are both supported.
6. Click **Find real road routes**. The provider may return fewer than three alternatives; none are fabricated.

No dependency installation is needed merely to run the included production build: the server uses Node built-ins and browser dependencies are already bundled. For rebuilding or development: `npm ci`, `npm run build`, `npm start`. If the port is occupied, change PORT in `.env` and use that port in your browser.

**Do not put the key in frontend code, a VITE_ variable, a screenshot, chat, or source control.** The backend reads `.env`; restart it after editing. `.env` is excluded from the ZIP and ignored by Git. This is a local pilot server, not a hardened public API gateway. It limits request size, validates coordinate ranges and a 50 m–100 km endpoint distance, checks same-origin browser requests and rate-limits by connection IP. For public deployment, additionally configure trusted hosts, appropriate authentication/abuse controls, platform secret storage and shared rate limits. There is no fixed city boundary because the user has not supplied a city; do not describe the endpoint-distance limit as a city geofence.

## Your pilot locations
No city, campus, parking facility or destination has been guessed. You must choose actual locations before the presentation. Obtain decimal coordinates from a map or use the map's placement controls. Verify that the returned roads are reasonable for your intended journey. Clicking Find sends the coordinates to openrouteservice; opening the real map requests online OSM tiles. No browser geolocation is requested.

## Added interactions
- Separate real-area planner alongside the preserved simulation lab.
- Local Leaflet renderer with online OpenStreetMap tiles and visible attribution.
- Server-side openrouteservice driving-route adapter; credentials never sent to the frontend.
- Real provider geometry, distance and duration after successful API requests.
- Route selection and map highlighting; fit-to-journey and map placement.
- Time/cost/emissions weighted candidate ranking.
- 0/3/5/custom-minute detour eligibility relative to the fastest returned candidate.
- Vehicle/passenger settings and adjustable EV grid assumption.
- Unknown-accessibility disclosure; mandatory verified access blocks a recommendation.
- Transparent source-status panel and JSON export of route estimates and assumptions.
- Missing-key, validation, provider failure, quota and no-route states.

## What has NOT changed
The seven existing domain/fixture modules are byte-identical to the baseline hashes in `docs/real-area/engine-before.sha256`. The original synthetic journey planner, 1,000-driver experiment, Park & Ride, adaptive trip, receipts, wallet, redemptions and exports remain available. Synthetic allocation is NOT applied to the real map or claimed to be validated in the real area. The detour control is new in the real-area planner; it has NOT been retrofitted into the existing synthetic experiment.

## Honest limitations
- **No live key was supplied. Live-account authentication and real-route accuracy have not been verified.** The API adapter and route UI were tested with explicit mocked provider responses. Key-free missing-key behavior was tested against the actual local server.
- The real map is interactive **2D**, prioritising a working geographic integration. The existing simulation retains its optional dimensional SVG city view. A WebGL 3D real city is NOT implemented.
- No address autocomplete/geocoder, live traffic, real parking availability, reservations, transit timetable feed or verified accessibility is connected.
- Real-area routes are driving candidates only. Park & Ride stays in the simulation; there are no invented real parking facilities.
- The new real-route model reuses shared demo factors, not synthetic elevations or traffic. Combustion uses distance-based fuel; EV includes distance energy plus duration auxiliary energy. Congestion, stops and elevation are unknown and not added. These are operational proxies, not measured savings or a harmonised lifecycle inventory. The UI explains the exclusions.
- Route results are transient snapshots and clear when endpoints change. There is no claim of global optimality or exhaustive alternatives.
- No completion/rewards are awarded for a real route request. Existing simulation rewards remain demo-only.
- Real map tiles and real routing require internet. Standard public OSM tiles are not included for offline use; no tile bulk download/prefetch is implemented. If tiles fail, returned route geometry remains visible with a warning. Switch explicitly to the synthetic lab for a fully offline map.
- Provider quotas/terms apply. Keep OSM attribution visible. Sources: https://operations.osmfoundation.org/policies/tiles/ and https://openrouteservice.org/dev/ .

## Tests
See `docs/real-area/` for actual output:
- `engine-results.txt`: 19 unchanged engine checks.
- `simulation-regression.txt`: 15 browser regression checks on the existing simulation.
- `api-results.txt`: 14 API validation/adapter/error/throttling checks (provider mocked).
- `model-results.txt`: 7 detour, ranking, passenger and EV model checks.
- `browser-results.txt`: new real-area browser checks (route responses mocked, tile requests blocked to avoid automated public tile traffic).
- Screenshots labelled `fixture` show explicit TEST coordinates and mocked routes, not an authenticated live journey. Tile-error screenshots deliberately test unavailable basemap behavior.

Run tests after `npm ci` and `npm run build`:

```sh
npm test
node tests/real-api.mjs
node tests/real-model.mjs
npm run typecheck
```

Browser integration script expects the server on port 4175: set PORT=4175 in `.env`, run `npm start` and then `node tests/real-browser.mjs`. It expects no configured key for its missing-key test. Existing browser regression supports TEST_URL; otherwise defaults to port 4173.

## Judge demo (about 60–90 seconds)
1. Configure a real verified pilot pair and request routes before presenting.
2. Show the real map, actual provider paths, distance and duration.
3. Change vehicle, preferences and detour limit; explain estimates and missing data.
4. Switch to Simulation lab. State that this is a separate controlled network experiment.
5. Run the 1,000-driver comparison and inspect allocation and unfinished counts.
6. Demonstrate an incident/reroute or completed receipt and demo wallet.
7. Open source-status/assumptions: real geography is not live traffic, and simulation is not a validated transport study.
