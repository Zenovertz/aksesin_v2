const test = require('node:test');
const assert = require('node:assert/strict');
const { planRoute, compareRoutes, resolvePlace } = require('../../public/js/navigation/route-engine.js');
const demo = require('../../public/data/indoor/demo-plan.js');

const entryToToilet = { fromId: 'entrance-gf', toId: 'toilet-gf' };
const ids = route => route.edges.map(edge => edge.id);
const cloneDemo = () => structuredClone(demo);
const point = (id, x, y, floorId = 'gf') => ({ id, label: id, x, y, floorId });
const corridor = (id, from, to, overrides = {}) => ({
  id, from, to, kind: 'corridor', distanceM: 30, widthCm: 180,
  slopePct: 0, waitSeconds: 0, surface: 'smooth', open: true, accessible: true,
  ...overrides
});
const smallPlan = () => ({
  mode: 'demo', floors: [{ id: 'gf', label: 'GF' }],
  nodes: [point('start', 0, 0), point('corner', 100, 0), point('end', 100, 100)],
  edges: [corridor('first', 'start', 'corner'), corridor('second', 'corner', 'end')]
});
const smallTrip = { fromId: 'start', toId: 'end', profile: 'shortest' };

test('the same indoor trip offers three distinct wheelchair routes with honest tradeoffs', () => {
  const before = structuredClone(demo);
  const routes = compareRoutes(demo, entryToToilet);
  assert.deepEqual(Object.keys(routes), ['recommended', 'shortest', 'fastest']);
  for (const [profile, route] of Object.entries(routes)) {
    assert.equal(route.status, 'ok');
    assert.equal(route.mode, 'demo');
    assert.equal(route.profile, profile);
    assert.equal(route.nodes[0].id, entryToToilet.fromId);
    assert.equal(route.nodes.at(-1).id, entryToToilet.toId);
    assert.equal(route.steps.length, route.edges.length);
    assert.ok(route.edges.every(edge => edge.open && edge.accessible && edge.kind === 'corridor'));
  }
  assert.deepEqual(ids(routes.recommended), ['entry-west', 'south-down', 'south-to-lift', 'south-from-lift', 'south-up']);
  assert.deepEqual(ids(routes.shortest), ['entry-west', 'middle-west', 'middle-east']);
  assert.deepEqual(ids(routes.fastest), ['entry-west', 'north-up', 'north-across', 'north-down']);
  assert.equal(routes.shortest.distanceM, 160);
  assert.equal(routes.fastest.distanceM, 210);
  assert.equal(routes.recommended.distanceM, 230);
  assert.ok(routes.fastest.durationSeconds < routes.recommended.durationSeconds);
  assert.ok(routes.recommended.durationSeconds < routes.shortest.durationSeconds);
  assert.ok(routes.recommended.edges.every(edge => edge.widthCm >= 150 && edge.surface === 'smooth' && edge.slopePct === 0));
  assert.match(routes.shortest.steps[1].instruction, /95 cm/);
  assert.match(routes.shortest.steps[1].instruction, /4%/);
  assert.match(routes.shortest.steps[1].instruction, /lebih kasar/);
  assert.deepEqual(demo, before, 'routing must not mutate the shared catalog');
});

test('stairs, closed paths and missing access evidence never become a tempting shortcut', async t => {
  const exclusions = {
    stairs: { kind: 'stairs' },
    escalator: { kind: 'escalator' },
    closed: { open: false },
    inaccessible: { accessible: false },
    narrow: { widthCm: 89 },
    steep: { slopePct: 6.1 },
    'unknown width': { widthCm: undefined },
    'unknown slope': { slopePct: undefined },
    'unknown surface': { surface: undefined },
    'unknown open status': { open: undefined },
    'unknown accessibility': { accessible: undefined },
    'unknown wait': { waitSeconds: undefined },
    'invalid distance': { distanceM: NaN },
    'unknown destination': { to: 'missing' }
  };
  for (const [name, overrides] of Object.entries(exclusions)) {
    await t.test(name, () => {
      const plan = smallPlan();
      const shortcut = corridor('shortcut', 'start', 'end', { distanceM: 1 });
      plan.edges.push(shortcut);
      assert.deepEqual(ids(planRoute(plan, smallTrip)), ['shortcut'], 'fixture shortcut should otherwise win');
      Object.assign(shortcut, overrides);
      for (const route of Object.values(compareRoutes(plan, smallTrip))) {
        assert.equal(route.status, 'ok');
        assert.deepEqual(ids(route), ['first', 'second']);
      }
    });
  }
});

test('stricter width, slope and surface preferences are hard route constraints', () => {
  for (const preferences of [{ minWidthCm: 100 }, { maxSlopePct: 0 }, { avoidRough: true }]) {
    const route = planRoute(demo, { ...entryToToilet, profile: 'shortest', preferences });
    assert.equal(route.status, 'ok');
    assert.ok(!ids(route).some(id => id.startsWith('middle-')));
  }
  const wide = planRoute(demo, { ...entryToToilet, profile: 'shortest', preferences: { minWidthCm: 150 } });
  assert.deepEqual(ids(wide), ['entry-west', 'south-down', 'south-to-lift', 'south-from-lift', 'south-up']);
  assert.equal(planRoute(demo, { ...entryToToilet, preferences: { minWidthCm: 200 } }).status, 'unreachable');
});

test('only explicitly verified production plans or clearly marked demos can produce directions', () => {
  for (const overrides of [{ mode: 'verified' }, { mode: 'verified', verified: false }, { mode: 'unverified', verified: true }, { mode: 'real', verified: true }]) {
    const plan = { ...cloneDemo(), ...overrides };
    assert.equal(planRoute(plan, entryToToilet).status, 'invalid');
    assert.deepEqual(planRoute(plan, entryToToilet).steps, []);
  }
  const verified = { ...cloneDemo(), mode: 'verified', verified: true };
  const route = planRoute(verified, entryToToilet);
  assert.equal(route.status, 'ok');
  assert.equal(route.mode, 'verified');
});

test('a blocked upcoming segment recalculates from the current point and never reuses that segment', () => {
  const route = planRoute(demo, { fromId: 'west-gf', toId: 'toilet-gf', blockedEdgeIds: ['south-down'] });
  assert.equal(route.status, 'ok');
  assert.equal(route.nodes[0].id, 'west-gf');
  assert.deepEqual(ids(route), ['north-up', 'north-across', 'north-down']);
  assert.ok(!ids(route).includes('entry-west'));
  const isolated = planRoute(demo, { ...entryToToilet, blockedEdgeIds: ['entry-west'] });
  assert.equal(isolated.status, 'unreachable');
  assert.deepEqual(isolated.steps, []);
  const reverse = planRoute(demo, { fromId: 'west-gf', toId: 'entrance-gf', blockedEdgeIds: ['entry-west'] });
  assert.equal(reverse.status, 'unreachable', 'closures apply in either direction');
});

test('cross-floor routes use a lift, expose the floor transition and reset heading afterwards', () => {
  const route = planRoute(demo, { fromId: 'entrance-gf', toId: 'toilet-l1' });
  assert.equal(route.status, 'ok');
  assert.ok(!route.edges.some(edge => edge.kind === 'stairs'));
  const liftIndex = route.edges.findIndex(edge => edge.kind === 'lift');
  assert.ok(liftIndex >= 0);
  assert.equal(route.steps[liftIndex].floorId, 'gf');
  assert.equal(route.steps[liftIndex].toFloorId, 'l1');
  assert.match(route.steps[liftIndex].instruction, /lift menuju lantai L1/);
  assert.match(route.steps[liftIndex + 1].instruction, /^Ikuti koridor/);
  const noLift = planRoute(demo, { fromId: 'entrance-gf', toId: 'toilet-l1', blockedEdgeIds: ['lift-between-floors'] });
  assert.equal(noLift.status, 'unreachable', 'the shorter stair connection cannot replace a closed lift');
  const reverse = planRoute(demo, { fromId: 'toilet-l1', toId: 'entrance-gf' });
  assert.match(reverse.steps.find(step => step.edgeId === 'lift-between-floors').instruction, /lift menuju lantai GF/);
  const descending = planRoute(demo, { fromId: 'lift-l1', toId: 'lift-gf' });
  assert.equal(descending.status, 'ok');
  assert.equal(descending.steps.length, 1);
  assert.match(descending.steps[0].instruction, /^Gunakan lift menuju lantai GF/);
});

test('turns are relative to travel direction, including reverse travel and a U-turn', () => {
  const plan = smallPlan();
  const forward = planRoute(plan, smallTrip);
  assert.match(forward.steps[0].instruction, /^Ikuti koridor/);
  assert.match(forward.steps[1].instruction, /^Belok kanan/);
  const reverse = planRoute(plan, { fromId: 'end', toId: 'start' });
  assert.match(reverse.steps[1].instruction, /^Belok kiri/);
  plan.nodes[2].x = 50;
  plan.nodes[2].y = 0;
  assert.match(planRoute(plan, smallTrip).steps[1].instruction, /^Putar balik/);
  plan.nodes[2].x = 200;
  assert.match(planRoute(plan, smallTrip).steps[1].instruction, /^Lanjut lurus/);
});

test('malformed floor links and duplicate segment identities are excluded', () => {
  const plan = smallPlan();
  plan.floors.push({ id: 'l1', label: 'L1' });
  plan.nodes[2].floorId = 'l1';
  assert.equal(planRoute(plan, smallTrip).status, 'unreachable', 'a corridor cannot jump floors');
  plan.edges[1].kind = 'lift';
  assert.equal(planRoute(plan, smallTrip).status, 'unreachable', 'lift endpoints must align');
  plan.nodes[2].y = 0;
  assert.equal(planRoute(plan, smallTrip).status, 'ok');
  const duplicate = smallPlan();
  duplicate.edges.push(corridor('shortcut', 'start', 'end', { distanceM: 1 }), corridor('shortcut', 'start', 'end', { distanceM: 2 }));
  assert.deepEqual(ids(planRoute(duplicate, smallTrip)), ['first', 'second']);
});

test('same-place, unknown points and invalid preferences return explicit non-route statuses', () => {
  const same = planRoute(demo, { fromId: 'entrance-gf', toId: 'entrance-gf' });
  assert.equal(same.status, 'same-place');
  assert.equal(same.distanceM, 0);
  assert.equal(same.durationSeconds, 0);
  assert.deepEqual(same.steps, []);
  for (const overrides of [
    { fromId: 'missing' }, { toId: 'missing' }, { profile: 'unsafe' },
    { preferences: { minWidthCm: 50 } }, { preferences: { maxSlopePct: 7 } },
    { preferences: { avoidRough: 'yes' } }, { preferences: [] }, { blockedEdgeIds: 'first' }, { blockedEdgeIds: [null] }
  ]) {
    const result = planRoute(demo, { ...entryToToilet, ...overrides });
    assert.equal(result.status, 'invalid');
    assert.deepEqual(result.steps, []);
  }
  assert.equal(planRoute(null, entryToToilet).status, 'invalid');
  for (const options of [null, 7, 'start', []]) {
    assert.equal(planRoute(demo, options).status, 'invalid');
  }
  for (const floors of [[null], [{}], [{ id: '' }], [{ id: 42 }]]) {
    assert.equal(planRoute({ ...demo, floors }, entryToToilet).status, 'invalid');
  }
  const duplicateNode = cloneDemo();
  duplicateNode.nodes.push({ ...duplicateNode.nodes[0] });
  assert.equal(planRoute(duplicateNode, entryToToilet).status, 'invalid');
});

test('place resolution accepts exact normalized aliases and rejects partial or ambiguous names', () => {
  assert.equal(resolvePlace(demo, '  PINTU—UTAMA!  ').id, 'entrance-gf');
  assert.equal(resolvePlace(demo, 'customer service').id, 'concierge-gf');
  assert.equal(resolvePlace(demo, 'toilet'), null, 'a floor is required for a shared toilet alias');
  assert.equal(resolvePlace(demo, 'toilet', { floorId: 'gf' }).id, 'toilet-gf');
  assert.equal(resolvePlace(demo, 'toilet', { floorId: 'l1' }).id, 'toilet-l1');
  assert.equal(resolvePlace(demo, 'lift'), null);
  assert.equal(resolvePlace(demo, 'lift', { floorId: 'l1', type: 'lift' }).id, 'lift-l1');
  assert.equal(resolvePlace(demo, 'lift', { floorId: 'l1', type: 'toilet' }), null);
  for (const text of ['dekat concierge', 'dari pintu utama', 'toilet di lantai 99', 'pintu ut', 'toko tidak dikenal', null, 123, '']) {
    assert.equal(resolvePlace(demo, text), null);
  }
  assert.equal(resolvePlace(null, 'toilet'), null);
});
