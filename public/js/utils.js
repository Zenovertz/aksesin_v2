(function (root) {
  "use strict";
  function normalize(text) {
    return typeof text === "string" ? text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() : "";
  }

  function validPoint(point) {
    return point && typeof point === "object" && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  }

  function distanceMeters(a, b) {
    if (!validPoint(a) || !validPoint(b)) throw new TypeError("Koordinat lokasi tidak valid.");
    const rad = degrees => degrees * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
  }

  function inMedan(point) {
    return Boolean(validPoint(point) && point.lat >= 3.35 && point.lat <= 3.90 && point.lon >= 98.45 && point.lon <= 98.90);
  }

  const api = { normalize, distanceMeters, inMedan };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AksesinUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
