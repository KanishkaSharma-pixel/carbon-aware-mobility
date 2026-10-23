# Project Tech Stack

## Frontend
We used React 19 and TypeScript to build the interface, including the
journey planner, route cards, traffic experiment and rewards wallet.
The styling uses plain CSS for the colour scheme, responsive layouts
and selected states.

## Maps and Routing
The real-area planner uses Leaflet with OpenStreetMap tiles.
Our openrouteservice integration requests driving routes, distances
and estimated journey times. These requests require a valid API key.

The simulation has a separate SVG map with selectable roads, route
highlighting, traffic indicators and a dimensional city view.

## Backend
A small Node.js server serves the website and forwards routing
requests to openrouteservice. The API key stays in a private .env
file, which is excluded from GitHub through .gitignore.

## Application Logic
Custom TypeScript modules handle route scoring, accessibility checks,
traffic allocation, incident rerouting and estimated emissions.
The traffic comparison uses seeded data so runs can be repeated
under the same conditions.

## Local Storage
We use the browser’s localStorage for preferences, completed-trip
receipts and the demo rewards wallet. There is no external database.

## Build, Testing and Version Control
- esbuild bundles the frontend.
- TypeScript checks the application’s types.
- Playwright tests browser interactions.
- Node.js assertions test calculations and reward rules.
- Git tracks changes, and GitHub stores the source code.

## What Is Simulated
Traffic demand, incidents, parking occupancy, transit timetables and
rewards are simulated. Emissions and costs are calculated using demo
assumptions, not measured data. We have not used a trained ML model
or connected a live traffic feed.
## Calculation Model

### Fuel vehicles
Estimated fuel use is calculated as:

Fuel (L) = Distance (km) × Base consumption (L/100 km) ÷ 100

In the simulation, we also apply a movement adjustment for modelled
elevation and stop-start conditions, then add fuel used while idling:

Fuel (L) = Distance × Base consumption ÷ 100 × Adjustment
           + Idle time (min) × Idle consumption (L/min)

Estimated emissions = Fuel used × Emission factor (kg CO₂/L)

### Electric vehicles
Energy (kWh) = Distance (km) × Consumption (kWh/km) × Adjustment
               + Auxiliary energy (kWh)

Estimated emissions (kg CO₂e) = Energy × Grid intensity (g CO₂e/kWh) ÷ 1000

The real-area planner does not add traffic or elevation adjustments
because those inputs are not connected.

### Passenger comparisons
Shared vehicle emissions and energy costs are divided by the passenger
count to show per-passenger estimates.

### Reward points
Points = floor(max(0, Baseline emissions − Completed-trip emissions) × 100)

Points are capped at 300 per completed simulated trip.
No positive estimated saving means no carbon-saving points.

All consumption values and emission factors are demo assumptions,
not locally validated measurements.