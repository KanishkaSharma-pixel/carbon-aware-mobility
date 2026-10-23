// src/emissions.ts
var assumptions = { currency: "USD", fuelPrice: 1.65, electricityPrice: 0.24, transitFare: 0.8, transitKgPerPassengerKm: 0.045, petrolFactor: 2.31, dieselFactor: 2.68, baseLitres: { "Petrol car": 7.2, "Diesel car": 5.8, "Hybrid": 4.3 }, idleLitresPerMinute: 0.02, boundary: "Operational proxy: combustion tailpipe CO2; EV electricity-generation CO2e; transit per-passenger operational proxy. Not a complete lifecycle or strictly harmonised CO2e inventory.", source: "Demo assumption\u2014not a validated local factor", excluded: "Vehicle/battery manufacture, fuel upstream emissions, infrastructure, non-CO2 combustion effects, transit service allocation and induced demand." };

// src/realModel.ts
function estimateReal(route, vehicle, occupancy, grid) {
  const km = route.metres / 1e3, minutes = route.seconds / 60;
  const fuel = vehicle === "EV" ? 0 : km * (assumptions.baseLitres[vehicle] || 7.2) / 100;
  const energy = vehicle === "EV" ? km * 0.17 + minutes * 0.012 : 0;
  return { km, minutes, fuel, energy, carbon: (vehicle === "EV" ? energy * grid / 1e3 : fuel * (vehicle === "Diesel car" ? assumptions.dieselFactor : assumptions.petrolFactor)) / occupancy, cost: (fuel * assumptions.fuelPrice + energy * assumptions.electricityPrice) / occupancy };
}
function rankReal(routes, vehicle, occupancy, grid, detour, weights) {
  const totals = routes.map((r) => ({ ...r, ...estimateReal(r, vehicle, occupancy, grid) }));
  const fastest = Math.min(...totals.map((r) => r.minutes));
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const ws = w.reduce((a, b) => a + b, 0) || 1;
  const keys = ["minutes", "cost", "carbon"];
  return totals.map((r) => ({ ...r, feasible: r.minutes - fastest <= detour + 1e-6, score: keys.reduce((sum, k, i) => {
    const lo = Math.min(...totals.map((t) => t[k])), hi = Math.max(...totals.map((t) => t[k]));
    return sum + (hi === lo ? 0 : (r[k] - lo) / (hi - lo)) * w[i] / ws;
  }, 0) })).sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.score - b.score || a.minutes - b.minutes);
}
export {
  estimateReal,
  rankReal
};
