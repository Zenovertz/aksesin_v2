(function (root) {
  "use strict";
  const floor = (id, label, sourceUrl) => ({ id, label, sourceUrl });
  const deli = 'https://delipark.com/MapDir';
  const sun = 'https://www.lippomalls.com/mall/Sun-Plaza/facilities';
  // Published directory labels, not a surveyed floor/connector graph.
  const FLOORS = {
    delipark: [['lg', 'LG'], ['lm', 'LM'], ['gf', 'GF'], ['gf-rivapark', 'GF Rivapark'], ['ug', 'UG'], ['ug-rivapark', 'UG Rivapark'], ['l1', 'L1'], ['l2', 'L2'], ['l3', 'L3'], ['l3a', 'L3A'], ['delica', 'Delica Food Court'], ['l5', 'L5']].map(([id, label]) => floor(id, label, deli)),
    'sun-plaza': [['gf', 'GF'], ['ug', 'UG'], ['l1', 'L1']].map(([id, label]) => floor(id, label, sun))
  };
  // No asset has been calibrated or inspected as a navigable accessible floor plan.
  const FLOORPLANS = {};
  const getFloors = mallId => Object.hasOwn(FLOORS, mallId) ? FLOORS[mallId] : [];
  const getFloor = (mallId, id) => getFloors(mallId).find(item => item.id === id) || null;
  const api = { FLOORS, FLOORPLANS, getFloors, getFloor };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AksesinFloors = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
