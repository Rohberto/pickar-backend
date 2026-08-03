// Approximate Lagos zone boundaries for fare calculation.
// These are rough rectangles, not official administrative boundaries — enough
// to bucket a coordinate into a zone for pricing. Tighten with real GeoJSON
// (exported from Google My Maps or OSM) as you scale past the first 2-3 zones.

const ZONES = {
  ISLAND_CORE: {
    label: 'Island Core',
    // Lagos Island, VI, Ikoyi, Obalende
    polygon: [
      [6.4150, 3.3850], [6.4150, 3.4350], [6.4550, 3.4350], [6.4550, 3.3850],
    ],
  },
  LEKKI_AJAH: {
    label: 'Lekki/Ajah',
    polygon: [
      [6.4000, 3.4350], [6.4000, 3.6200], [6.4550, 3.6200], [6.4550, 3.4350],
    ],
  },
  MAINLAND_CORE: {
    label: 'Mainland Core',
    // Surulere, Ebute-Metta, Mushin, Onikan
    polygon: [
      [6.4500, 3.3400], [6.4500, 3.3900], [6.4900, 3.3900], [6.4900, 3.3400],
    ],
  },
  IKEJA_YABA: {
    label: 'Ikeja/Yaba',
    polygon: [
      [6.4900, 3.3200], [6.4900, 3.4000], [6.5900, 3.4000], [6.5900, 3.3200],
    ],
  },
  IKORODU: {
    label: 'Ikorodu',
    polygon: [
      [6.5300, 3.4500], [6.5300, 3.6200], [6.6200, 3.6200], [6.6200, 3.4500],
    ],
  },
  BADAGRY: {
    label: 'Badagry',
    polygon: [
      [6.3200, 2.8500], [6.3200, 3.1500], [6.4200, 3.1500], [6.4200, 2.8500],
    ],
  },
  EPE: {
    label: 'Epe',
    polygon: [
      [6.4500, 3.9200], [6.4500, 4.2500], [6.6100, 4.2500], [6.6100, 3.9200],
    ],
  },
};

// Standard ray-casting point-in-polygon check. Works for any polygon shape,
// not just rectangles — so swapping in real boundaries later needs zero
// changes here.
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Returns the zone key for a coordinate, or 'UNZONED' if outside all
// defined zones (falls back to distance-only pricing for that leg).
function getZoneForPoint(lat, lng) {
  for (const [key, zone] of Object.entries(ZONES)) {
    if (isPointInPolygon(lat, lng, zone.polygon)) return key;
  }
  return 'UNZONED';
}

// Zone-pair fee matrix — intra-zone is cheap, inter-zone rises with the
// real Lagos traffic pain (Island <-> Mainland, anything <-> Epe/Badagry).
// Symmetric — order of pickup/dropoff doesn't matter.
const ZONE_FEE_MATRIX = {
  ISLAND_CORE: { ISLAND_CORE: 0, MAINLAND_CORE: 1500, LEKKI_AJAH: 500, IKEJA_YABA: 2000, IKORODU: 3500, BADAGRY: 5000, EPE: 4000, UNZONED: 1000 },
  MAINLAND_CORE: { MAINLAND_CORE: 0, LEKKI_AJAH: 2000, IKEJA_YABA: 800, IKORODU: 2000, BADAGRY: 3500, EPE: 4500, UNZONED: 1000 },
  LEKKI_AJAH: { LEKKI_AJAH: 0, IKEJA_YABA: 2500, IKORODU: 2500, BADAGRY: 6000, EPE: 3000, UNZONED: 1000 },
  IKEJA_YABA: { IKEJA_YABA: 0, IKORODU: 2000, BADAGRY: 4000, EPE: 4500, UNZONED: 1000 },
  IKORODU: { IKORODU: 0, BADAGRY: 6500, EPE: 3500, UNZONED: 1000 },
  BADAGRY: { BADAGRY: 0, EPE: 7000, UNZONED: 1500 },
  EPE: { EPE: 0, UNZONED: 1500 },
  UNZONED: { UNZONED: 500 },
};

function getZoneFee(zoneA, zoneB) {
  if (ZONE_FEE_MATRIX[zoneA]?.[zoneB] !== undefined) return ZONE_FEE_MATRIX[zoneA][zoneB];
  if (ZONE_FEE_MATRIX[zoneB]?.[zoneA] !== undefined) return ZONE_FEE_MATRIX[zoneB][zoneA];
  return 1000; // fallback for any unmapped pair
}

module.exports = { ZONES, getZoneForPoint, getZoneFee };