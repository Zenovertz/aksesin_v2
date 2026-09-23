(function (root) {
  'use strict';
  const PROFILES = ['recommended', 'shortest', 'fastest'];
  const normalize = value => typeof value === 'string' ? value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ') : '';
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const round = value => Math.round(value * 10) / 10;

  function resolvePlace(plan, text, filters = {}) {
    const query = normalize(text);
    if (!query || !Array.isArray(plan?.nodes)) return null;
    const matches = plan.nodes.filter(node => (!filters.floorId || node.floorId === filters.floorId)
      && (!filters.type || node.type === filters.type)
      && [node.id, node.label, ...(Array.isArray(node.aliases) ? node.aliases : [])].some(alias => normalize(alias) === query));
    return matches.length === 1 ? matches[0] : null;
  }

  function validPlan(plan) {
    if (!plan || !(plan.mode === 'demo' || plan.mode === 'verified' && plan.verified === true)
      || !Array.isArray(plan.floors) || !plan.floors.length || !Array.isArray(plan.nodes) || !plan.nodes.length || !Array.isArray(plan.edges)) return false;
    if (!plan.floors.every(floor => floor && typeof floor.id === 'string' && floor.id && typeof floor.label === 'string')) return false;
    const floors = new Set(plan.floors.map(floor => floor.id));
    const ids = new Set();
    return floors.size === plan.floors.length && plan.nodes.every(node => {
      if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || !floors.has(node.floorId)
        || typeof node.label !== 'string' || !finite(node.x, -100000, 100000) || !finite(node.y, -100000, 100000)) return false;
      ids.add(node.id); return true;
    });
  }

  function preferencesFor(input) {
    if (input == null) return { minWidthCm: 90, maxSlopePct: 6, avoidRough: false };
    if (typeof input !== 'object' || Array.isArray(input)) return null;
    const value = { minWidthCm: 90, maxSlopePct: 6, avoidRough: false, ...input };
    if (!finite(value.minWidthCm, 90, 300) || !finite(value.maxSlopePct, 0, 6) || typeof value.avoidRough !== 'boolean') return null;
    return value;
  }

  function canTraverse(edge, nodes, prefs, blocked, duplicates) {
    if (!edge || typeof edge.id !== 'string' || !edge.id || duplicates.has(edge.id) || blocked.has(edge.id)
      || !nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to
      || !['corridor', 'lift'].includes(edge.kind) || edge.open !== true || edge.accessible !== true
      || !finite(edge.distanceM, 0.1, 10000) || !finite(edge.widthCm, prefs.minWidthCm, 1000)
      || !finite(edge.slopePct, 0, prefs.maxSlopePct) || !finite(edge.waitSeconds, 0, 3600)
      || !['smooth', 'rough'].includes(edge.surface) || prefs.avoidRough && edge.surface === 'rough') return false;
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    return edge.kind === 'corridor' ? from.floorId === to.floorId
      : from.floorId !== to.floorId && Math.hypot(from.x - to.x, from.y - to.y) <= 1;
  }

  function duration(edge) {
    const widthFactor = edge.widthCm < 100 ? 0.55 : edge.widthCm < 110 ? 0.8 : 1;
    const speed = 0.9 * widthFactor * (edge.surface === 'rough' ? 0.65 : 1) * (1 - edge.slopePct * 0.08);
    return edge.distanceM / speed + edge.waitSeconds;
  }

  function weight(edge, profile) {
    if (profile === 'shortest') return edge.distanceM;
    if (profile === 'fastest') return duration(edge);
    return edge.distanceM * (edge.widthCm < 150 ? 1.4 : 1) * (edge.surface === 'rough' ? 1.8 : 1)
      * (1 + edge.slopePct * 0.15) + edge.waitSeconds * 0.35;
  }

  function directions(plan, routeNodes, routeEdges) {
    let previousVector = null;
    return routeEdges.map((edge, index) => {
      const from = routeNodes[index], to = routeNodes[index + 1];
      let instruction;
      if (edge.kind === 'lift') {
        const floor = plan.floors.find(item => item.id === to.floorId);
        instruction = 'Gunakan lift menuju lantai ' + (floor?.label || to.floorId) + '.';
        previousVector = null;
      } else {
        const vector = { x: to.x - from.x, y: to.y - from.y };
        let action = 'Ikuti koridor';
        if (previousVector && Math.hypot(vector.x, vector.y) > 0) {
          // SVG y increases downwards: positive cross product is a right turn.
          const cross = previousVector.x * vector.y - previousVector.y * vector.x;
          const dot = previousVector.x * vector.x + previousVector.y * vector.y;
          const angle = Math.atan2(cross, dot) * 180 / Math.PI;
          action = Math.abs(angle) < 30 ? 'Lanjut lurus' : Math.abs(angle) > 150 ? 'Putar balik' : angle > 0 ? 'Belok kanan' : 'Belok kiri';
        }
        instruction = action + ' menuju ' + to.label + ' sejauh ' + round(edge.distanceM) + ' m.';
        if (edge.widthCm < 150) instruction += ' Lebar koridor ' + edge.widthCm + ' cm.';
        if (edge.slopePct > 0) instruction += ' Kemiringan ' + edge.slopePct + '%.';
        if (edge.surface === 'rough') instruction += ' Permukaan lebih kasar.';
        previousVector = Math.hypot(vector.x, vector.y) > 0 ? vector : null;
      }
      return { fromId: from.id, toId: to.id, floorId: from.floorId, toFloorId: to.floorId, instruction, distanceM: edge.distanceM, edgeId: edge.id };
    });
  }

  function planRoute(plan, options = {}) {
    const profile = options?.profile || 'recommended';
    const empty = (status, reason) => ({ status, reason, mode: plan?.mode || null, profile, nodes: [], edges: [], distanceM: 0, durationSeconds: 0, cost: null, steps: [] });
    if (!options || typeof options !== 'object' || Array.isArray(options)) return empty('invalid', 'Pengaturan rute tidak valid.');
    if (!validPlan(plan)) return empty('invalid', 'Denah belum memiliki data jalur yang terverifikasi atau bukan denah latihan.');
    if (!PROFILES.includes(profile)) return empty('invalid', 'Pilihan rute tidak dikenal.');
    const prefs = preferencesFor(options.preferences);
    if (!prefs || options.blockedEdgeIds !== undefined && (!Array.isArray(options.blockedEdgeIds) || !options.blockedEdgeIds.every(id => typeof id === 'string'))) return empty('invalid', 'Pengaturan akses jalur tidak valid.');
    const nodes = new Map(plan.nodes.map(node => [node.id, node]));
    if (!nodes.has(options.fromId) || !nodes.has(options.toId)) return empty('invalid', 'Pilih titik awal dan tujuan yang tersedia pada denah.');
    if (options.fromId === options.toId) return { ...empty('same-place', 'Titik awal dan tujuan sama.'), nodes: [nodes.get(options.fromId)], cost: 0 };
    const blocked = new Set(options.blockedEdgeIds || []), ids = new Set(), duplicates = new Set();
    for (const edge of plan.edges) { if (ids.has(edge?.id)) duplicates.add(edge?.id); ids.add(edge?.id); }
    const adjacency = new Map(plan.nodes.map(node => [node.id, []]));
    for (const edge of plan.edges) {
      if (!canTraverse(edge, nodes, prefs, blocked, duplicates)) continue;
      adjacency.get(edge.from).push({ to: edge.to, edge });
      adjacency.get(edge.to).push({ to: edge.from, edge });
    }
    const costs = new Map([[options.fromId, 0]]), previous = new Map(), visited = new Set();
    while (true) {
      let current = null, currentCost = Infinity;
      for (const [id, cost] of costs) if (!visited.has(id) && cost < currentCost) { current = id; currentCost = cost; }
      if (current === null || current === options.toId) break;
      visited.add(current);
      for (const { to, edge } of adjacency.get(current)) {
        if (visited.has(to)) continue;
        const nextCost = currentCost + weight(edge, profile);
        if (nextCost < (costs.get(to) ?? Infinity)) { costs.set(to, nextCost); previous.set(to, { from: current, edge }); }
      }
    }
    if (!costs.has(options.toId)) return empty('unreachable', 'Tidak ada jalur yang memenuhi kebutuhan kursi roda. Coba titik lain atau buka kembali jalur yang ditutup.');
    const routeNodes = [nodes.get(options.toId)], routeEdges = [];
    for (let current = options.toId; current !== options.fromId;) {
      const step = previous.get(current);
      routeEdges.unshift(step.edge); routeNodes.unshift(nodes.get(step.from)); current = step.from;
    }
    return {
      status: 'ok', reason: null, mode: plan.mode, profile, nodes: routeNodes, edges: routeEdges,
      distanceM: round(routeEdges.reduce((sum, edge) => sum + edge.distanceM, 0)),
      durationSeconds: Math.ceil(routeEdges.reduce((sum, edge) => sum + duration(edge), 0)),
      cost: costs.get(options.toId), steps: directions(plan, routeNodes, routeEdges)
    };
  }

  const compareRoutes = (plan, options = {}) => Object.fromEntries(PROFILES.map(profile => [profile, planRoute(plan, { ...options, profile })]));
  const api = { planRoute, compareRoutes, resolvePlace };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AksesinRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
