// Rate cards per vehicle type. Base + distance + weight, per the
// base+distance+weight+zone pricing model. Tune these numbers against real
// rider cost data (fuel, maintenance, daily target income) once you have it.

const RIDE_TYPES = [
  {
    type: 'standard',
    label: 'Standard',
    description: 'Regular bike delivery',
    vehicleClass: 'bike',
    baseFee: 1000,
    perKmRate: 180,
    perKgRate: 200,
    freeKgThreshold: 3,
    eta: 5,
  },
  {
    type: 'eco_send',
    label: 'Eco Send',
    description: 'Budget-friendly, scheduled/grouped delivery',
    vehicleClass: 'bike',
    baseFee: 800,
    perKmRate: 140,
    perKgRate: 180,
    freeKgThreshold: 3,
    scheduledDiscountPercent: 25, // cheaper because riders batch these
    eta: 5,
  },
  {
    type: 'express',
    label: 'Express',
    description: 'Delivers quickly',
    vehicleClass: 'bike',
    baseFee: 1200,
    perKmRate: 220,
    perKgRate: 220,
    freeKgThreshold: 3,
    expressPremiumPercent: 40, // urgency premium
    eta: null,
  },
  {
    type: 'truck',
    label: 'Truck',
    description: 'Best for house loads',
    vehicleClass: 'truck',
    baseFee: 5000,
    perKmRate: 350,
    perKgRate: 100,
    freeKgThreshold: 50,
    eta: 11,
  },
];

module.exports = { RIDE_TYPES };