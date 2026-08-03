const { RIDE_TYPES } = require('../config/rideTypes');
const { getZoneForPoint, getZoneFee } = require('../config/zones');
const { getActiveSurgeFees } = require('../config/surgeConfig');

const ROAD_DISTANCE_FACTOR = 1.3;

function calcDistanceKm(pickup, dropoff) {
  const R = 6371;
  const dLat = ((dropoff.lat - pickup.lat) * Math.PI) / 180;
  const dLng = ((dropoff.lng - pickup.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((pickup.lat * Math.PI) / 180) *
      Math.cos((dropoff.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const straightLineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return straightLineKm * ROAD_DISTANCE_FACTOR;
}

function calculateFare({ pickupCoords, dropoffCoords, weightKg = 1, rideType }) {
  const rateCard = RIDE_TYPES.find((r) => r.type === rideType);
  if (!rateCard) throw new Error(`Unknown ride type: ${rideType}`);

  if (weightKg > rateCard.maxWeightKg) {
    throw new Error(
      `${rateCard.label} has a ${rateCard.maxWeightKg}kg limit — this package is too heavy for this ride type`
    );
  }

  const distanceKm = calcDistanceKm(pickupCoords, dropoffCoords);

  const pickupZone = getZoneForPoint(pickupCoords.lat, pickupCoords.lng);
  const dropoffZone = getZoneForPoint(dropoffCoords.lat, dropoffCoords.lng);
  const zoneFee = getZoneFee(pickupZone, dropoffZone);

  const distanceFee = Math.round(distanceKm * rateCard.perKmRate);

  const billableKg = Math.max(0, weightKg - rateCard.freeKgThreshold);
  const weightFee = Math.round(billableKg * rateCard.perKgRate);

  let subtotal = rateCard.baseFee + distanceFee + weightFee + zoneFee;

  let adjustmentLabel = null;
  let adjustmentFee = 0;
  if (rateCard.expressPremiumPercent) {
    adjustmentFee = Math.round(subtotal * (rateCard.expressPremiumPercent / 100));
    adjustmentLabel = 'Express Premium';
    subtotal += adjustmentFee;
  } else if (rateCard.scheduledDiscountPercent) {
    adjustmentFee = -Math.round(subtotal * (rateCard.scheduledDiscountPercent / 100));
    adjustmentLabel = 'Scheduled Discount';
    subtotal += adjustmentFee;
  }

  const surgeFees = getActiveSurgeFees(subtotal, { pickupZone, dropoffZone });
  const surgeTotal = surgeFees.reduce((sum, s) => sum + s.fee, 0);
  const total = Math.round(subtotal + surgeTotal);

  const surgeBreakdown = {};
  surgeFees.forEach((s) => { surgeBreakdown[s.label] = s.fee; });

  return {
    rideType,
    distanceKm: Math.round(distanceKm * 10) / 10,
    pickupZone,
    dropoffZone,
    breakdown: {
      baseFee: rateCard.baseFee,
      distanceFee,
      weightFee,
      zoneFee,
      ...(adjustmentLabel ? { [adjustmentLabel]: adjustmentFee } : {}),
      ...surgeBreakdown,
    },
    total,
    eta: rateCard.eta,
    label: rateCard.label,
    description: rateCard.description,
  };
}

// Only prices ride types the package actually qualifies for by weight —
// e.g. a 30kg package will only ever get a Truck quote, not four options
// where three of them would throw on select-ride.
function calculateAllFares({ pickupCoords, dropoffCoords, weightKg = 1 }) {
  return RIDE_TYPES.filter((r) => weightKg <= r.maxWeightKg).map((r) =>
    calculateFare({ pickupCoords, dropoffCoords, weightKg, rideType: r.type })
  );
}

module.exports = { calculateFare, calculateAllFares, calcDistanceKm };