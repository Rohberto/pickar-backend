// utils/distance.js
const axios = require('axios');

const getRoadDistanceAndETA = async (originLat, originLng, destLat, destLng) => {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  
  const { data } = await axios.get(url);
  const element = data.rows[0]?.elements[0];
  
  if (element?.status === 'OK') {
    return {
      distanceText: element.distance.text,   // "3.2 km"
      distanceValue: element.distance.value, // 3200 (meters)
      durationText: element.duration.text,   // "12 mins"
      durationValue: element.duration.value, // 720 (seconds)
    };
  }
  return null;
};

module.exports = { getRoadDistanceAndETA };