// Extracted from deliveryController.js's local RIDE_TYPES constant so both
// the consumer send-package flow and the business batch order flow price
// deliveries identically. Optional cleanup: point deliveryController.js at
// this file too instead of keeping its own copy, so pricing can't drift.

const RIDE_TYPES = [
  {
    type: 'truck',
    label: 'Truck',
    description: 'Best for house loads',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 11,
  },
  {
    type: 'standard',
    label: 'Standard',
    description: 'Regular bike delivery',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 5,
  },
  {
    type: 'eco_send',
    label: 'Eco Send',
    description: 'Budget-friendly option',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 5,
  },
  {
    type: 'express',
    label: 'Express',
    description: 'Delivers quickly',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: null,
  },
];

const getRideType = (type) => RIDE_TYPES.find((r) => r.type === type) || null;

module.exports = { RIDE_TYPES, getRideType };