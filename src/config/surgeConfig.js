// Surge conditions are evaluated per-fare-calculation, not one global flag.
// Turn a condition off by flipping its `enabled` to false — nothing else in
// the pricing flow needs to change.

const SURGE_RULES = {
  peak_hour: {
    enabled: true,
    multiplier: 1.2,
    label: 'Peak Hour Fee',
    // Lagos is UTC+1 year-round (no DST) — safe to hardcode the offset,
    // so this works regardless of what timezone Render's server clock is in.
    windows: [
      { startHour: 7, endHour: 9 },   // morning rush
      { startHour: 16, endHour: 19 }, // evening rush
    ],
  },
  island_congestion: {
    enabled: true,
    multiplier: 1.25,
    label: 'Island Congestion Fee',
  },
  rain: {
    enabled: false, // no weather API wired up yet — manual toggle only
    multiplier: 1.15,
    label: 'Rain Fee',
  },
};

function getLagosHour() {
  const utcHour = new Date().getUTCHours();
  return (utcHour + 1) % 24;
}

function isPeakHour() {
  const hour = getLagosHour();
  return SURGE_RULES.peak_hour.windows.some(
    (w) => hour >= w.startHour && hour < w.endHour
  );
}

// Evaluates all active surge conditions and returns each applicable fee
// separately, so a trip that's both peak-hour AND island can show both
// line items on the receipt instead of picking one.
function getActiveSurgeFees(subtotal, { pickupZone, dropoffZone }) {
  const fees = [];

  if (SURGE_RULES.peak_hour.enabled && isPeakHour()) {
    fees.push({
      label: SURGE_RULES.peak_hour.label,
      fee: Math.round(subtotal * (SURGE_RULES.peak_hour.multiplier - 1)),
    });
  }

  if (
    SURGE_RULES.island_congestion.enabled &&
    (pickupZone === 'ISLAND_CORE' || dropoffZone === 'ISLAND_CORE')
  ) {
    fees.push({
      label: SURGE_RULES.island_congestion.label,
      fee: Math.round(subtotal * (SURGE_RULES.island_congestion.multiplier - 1)),
    });
  }

  if (SURGE_RULES.rain.enabled) {
    fees.push({
      label: SURGE_RULES.rain.label,
      fee: Math.round(subtotal * (SURGE_RULES.rain.multiplier - 1)),
    });
  }

  return fees;
}

module.exports = { SURGE_RULES, getActiveSurgeFees };