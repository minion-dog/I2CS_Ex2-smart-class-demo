// =====================================================================
//  geo.js - "is the student in the room or on Zoom?"
// =====================================================================
// WHY two formulas: haversine is the exact distance on a sphere; the
// "flat" formula is what the Firestore security rules can compute (they
// have sqrt but no cos), so the client must classify with the SAME flat
// formula the rules check. cos(latitude) of the lecturer is computed once
// on the lecturer's device and stored in the session document.

/** Tuning constants. */
export const GEO = Object.freeze({
    RADIUS_METERS: 1000,            // up to 1 km from the lecturer = in the class (decision Q5)
    EARTH_RADIUS: 6371000,          // meters
    METERS_PER_DEG_LAT: 110574,     // north-south meters per degree
    METERS_PER_DEG_LNG: 111320      // east-west meters per degree at the equator
});

/**
 * Computes the great-circle distance between two points.
 * @param {number} lat1 - degrees
 * @param {number} lng1 - degrees
 * @param {number} lat2 - degrees
 * @param {number} lng2 - degrees
 * @returns {number} meters
 */
export function haversineMeters(lat1, lng1, lat2, lng2)
{
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
    return 2 * GEO.EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

/**
 * Computes cos(latitude); stored once per session so the rules can use it.
 * @param {number} lat - degrees
 * @returns {number} cosine
 */
export function cosLatOf(lat)
{
    return Math.cos(lat * Math.PI / 180);
}

/**
 * Computes the distance on a flat map around the lecturer (good to ~1 % for a few km).
 * @param {number} lat0 - lecturer latitude
 * @param {number} lng0 - lecturer longitude
 * @param {number} cosLat0 - cos of the lecturer latitude
 * @param {number} lat - student latitude
 * @param {number} lng - student longitude
 * @returns {number} meters
 */
export function flatMeters(lat0, lng0, cosLat0, lat, lng)
{
    const dx = (lng - lng0) * cosLat0 * GEO.METERS_PER_DEG_LNG;
    const dy = (lat - lat0) * GEO.METERS_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Decides the attendance kind from a distance.
 * @param {number} meters - distance from the lecturer
 * @returns {string} 'inPerson' or 'zoom'
 */
export function classifyDistance(meters)
{
    if (meters <= GEO.RADIUS_METERS)
    {
        return 'inPerson';
    }
    return 'zoom';
}
