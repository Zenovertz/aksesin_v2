(function (root) {
  'use strict';
  // Synthetic teaching fixture. These coordinates are NOT a surveyed mall layout.
  const node = (id, label, floorId, x, y, type, aliases = []) => ({ id, label, floorId, x, y, type, aliases });
  const edge = (id, from, to, distanceM, overrides = {}) => ({
    id, from, to, distanceM, widthCm: 180, slopePct: 0,
    kind: 'corridor', open: true, accessible: true, surface: 'smooth', waitSeconds: 0, ...overrides
  });
  const plan = {
    id: 'indoor-demo', mode: 'demo', title: 'Denah latihan',
    description: 'Bangunan fiktif untuk mencoba navigasi kursi roda. Bukan denah DeliPark atau Sun Plaza; jangan dipakai sebagai petunjuk berjalan di mall sebenarnya.',
    viewBox: '0 0 800 480',
    floors: [{ id: 'gf', label: 'GF' }, { id: 'l1', label: 'L1' }],
    nodes: [
      node('entrance-gf', 'Pintu masuk', 'gf', 70, 240, 'entrance', ['pintu', 'pintu utama', 'pintu masuk gf', 'entrance']),
      node('west-gf', 'Simpang barat', 'gf', 170, 240, 'junction'),
      node('middle-gf', 'Koridor tengah', 'gf', 440, 240, 'junction'),
      node('toilet-gf', 'Toilet difabel GF', 'gf', 710, 240, 'toilet', ['toilet', 'wc', 'toilet difabel', 'toilet gf', 'wc gf']),
      node('north-west-gf', 'Simpang utara barat', 'gf', 170, 140, 'junction'),
      node('north-east-gf', 'Simpang utara timur', 'gf', 710, 140, 'junction'),
      node('south-west-gf', 'Simpang selatan barat', 'gf', 170, 380, 'junction'),
      node('south-east-gf', 'Simpang selatan timur', 'gf', 710, 380, 'junction'),
      node('concierge-gf', 'Concierge', 'gf', 170, 70, 'concierge', ['concierge gf', 'meja informasi', 'customer service', 'lobi', 'lobby']),
      node('wheelchair-gf', 'Peminjaman kursi roda', 'gf', 70, 70, 'wheelchair', ['pinjam kursi roda', 'kursi roda', 'tempat peminjaman kursi roda']),
      node('parking-gf', 'Parkir difabel', 'gf', 70, 380, 'parking', ['parkir', 'parkir gf']),
      node('lift-gf', 'Lift GF', 'gf', 440, 380, 'lift', ['lift', 'elevator', 'lift lantai dasar']),
      node('lift-l1', 'Lift L1', 'l1', 440, 380, 'lift', ['lift', 'elevator', 'lift lantai 1']),
      node('east-l1', 'Simpang timur L1', 'l1', 710, 380, 'junction'),
      node('toilet-l1', 'Toilet difabel L1', 'l1', 710, 240, 'toilet', ['toilet', 'wc', 'toilet difabel', 'toilet l1', 'toilet lantai 1', 'wc lantai 1']),
      node('west-l1', 'Simpang barat L1', 'l1', 170, 380, 'junction'),
      node('stairs-l1', 'Palier tangga L1', 'l1', 170, 240, 'junction'),
      node('cafe-l1', 'Kafe L1', 'l1', 170, 140, 'cafe', ['kafe', 'cafe', 'kafe lantai 1'])
    ],
    edges: [
      edge('entry-west', 'entrance-gf', 'west-gf', 25),
      // Short, but narrow, sloping and rough: intentionally different from the smoother alternatives.
      edge('middle-west', 'west-gf', 'middle-gf', 67.5, { widthCm: 95, slopePct: 4, surface: 'rough' }),
      edge('middle-east', 'middle-gf', 'toilet-gf', 67.5, { widthCm: 95, slopePct: 4, surface: 'rough' }),
      edge('north-up', 'west-gf', 'north-west-gf', 25, { widthCm: 120 }),
      edge('north-across', 'north-west-gf', 'north-east-gf', 135, { widthCm: 120 }),
      edge('north-down', 'north-east-gf', 'toilet-gf', 25, { widthCm: 120 }),
      edge('south-down', 'west-gf', 'south-west-gf', 35),
      edge('south-to-lift', 'south-west-gf', 'lift-gf', 67.5),
      edge('south-from-lift', 'lift-gf', 'south-east-gf', 67.5),
      edge('south-up', 'south-east-gf', 'toilet-gf', 35),
      edge('concierge-approach', 'north-west-gf', 'concierge-gf', 17.5),
      edge('wheelchair-approach', 'concierge-gf', 'wheelchair-gf', 25),
      edge('parking-approach', 'south-west-gf', 'parking-gf', 25),
      edge('lift-between-floors', 'lift-gf', 'lift-l1', 4, { kind: 'lift', widthCm: 110, waitSeconds: 45 }),
      edge('upper-east', 'lift-l1', 'east-l1', 67.5),
      edge('upper-toilet', 'east-l1', 'toilet-l1', 35),
      edge('upper-west', 'lift-l1', 'west-l1', 67.5),
      edge('upper-stair-landing', 'west-l1', 'stairs-l1', 35),
      edge('upper-cafe', 'stairs-l1', 'cafe-l1', 25),
      // Visible on the diagram to demonstrate that wheelchair routing always excludes stairs.
      edge('stairs-between-floors', 'west-gf', 'stairs-l1', 8, { kind: 'stairs', accessible: false })
    ]
  };
  if (typeof module === 'object' && module.exports) module.exports = plan;
  else root.AksesinDemoPlan = plan;
})(typeof globalThis !== 'undefined' ? globalThis : this);
