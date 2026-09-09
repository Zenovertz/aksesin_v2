const test = require('node:test');
const assert = require('node:assert/strict');
const routing = require('../aksesin-routing.js');

const EPSILON = 1e-7;
const FLOOR_CASES = [
  ['campus', 1],
  ['campus', 2],
  ['hospital', 1],
  ['hospital', 2]
];

function samePoint(actual, expected, message) {
  assert.ok(Math.abs(actual.x - expected.x) < EPSILON &&
    Math.abs(actual.y - expected.y) < EPSILON, message);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < EPSILON &&
    p.x >= Math.min(a.x, b.x) - EPSILON &&
    p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.y >= Math.min(a.y, b.y) - EPSILON &&
    p.y <= Math.max(a.y, b.y) + EPSILON;
}

// Independent geometry oracle: crossing or touching a solid wall is invalid.
function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) ||
    onSegment(c, d, a) || onSegment(c, d, b);
}

function checkDoorCrossings(room, a, b, context) {
  if (room.open) return;
  const edges = [
    { side: 'top', axis: 'y', value: room.y, lower: room.x, upper: room.x + room.width },
    { side: 'bottom', axis: 'y', value: room.y + room.height, lower: room.x, upper: room.x + room.width },
    { side: 'left', axis: 'x', value: room.x, lower: room.y, upper: room.y + room.height },
    { side: 'right', axis: 'x', value: room.x + room.width, lower: room.y, upper: room.y + room.height }
  ];
  for (const edge of edges) {
    const delta = b[edge.axis] - a[edge.axis];
    if (Math.abs(delta) < EPSILON) continue;
    const t = (edge.value - a[edge.axis]) / delta;
    if (t < -EPSILON || t > 1 + EPSILON) continue;
    const otherAxis = edge.axis === 'x' ? 'y' : 'x';
    const crossing = a[otherAxis] + t * (b[otherAxis] - a[otherAxis]);
    if (crossing < edge.lower - EPSILON || crossing > edge.upper + EPSILON) continue;
    assert.ok(room.door, `${context}: ${room.label} needs a doorway`);
    assert.equal(edge.side, room.door.side,
      `${context}: entered ${room.label} through its ${edge.side} wall`);
    assert.ok(Math.abs(crossing - room.door[otherAxis]) < room.door.width / 2 + EPSILON,
      `${context}: missed ${room.label}'s door opening`);
  }
}

function assertSafeRoute(floor, start, end, route, context) {
  assert.ok(route, `${context}: no route found`);
  assert.ok(Array.isArray(route.points) && route.points.length > 0,
    `${context}: missing route points`);
  samePoint(route.points[0], start, `${context}: ignored the selected starting position`);
  samePoint(route.points.at(-1), end, `${context}: did not reach the selected destination`);
  let measuredDistance = 0;
  for (const point of route.points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${context}: invalid route coordinate`);
    assert.ok(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100,
      `${context}: route left the floor plan`);
  }
  for (let index = 1; index < route.points.length; index += 1) {
    const a = route.points[index - 1];
    const b = route.points[index];
    measuredDistance += Math.hypot(b.x - a.x, b.y - a.y);
    for (const wall of floor.walls) {
      assert.ok(!segmentsIntersect(a, b, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }),
        `${context}: segment ${JSON.stringify([a, b])} crosses wall ${JSON.stringify(wall)}`);
    }
    for (const room of floor.rooms) checkDoorCrossings(room, a, b, context);
  }
  assert.ok(Number.isFinite(route.distance), `${context}: invalid route distance`);
  assert.ok(Math.abs(route.distance - measuredDistance) < EPSILON,
    `${context}: distance does not match the displayed route`);
  assert.ok(route.distance + EPSILON >= Math.hypot(end.x - start.x, end.y - start.y),
    `${context}: route distance is shorter than a direct line`);
}

for (const [buildingId, floorNumber] of FLOOR_CASES) {
  const context = `${buildingId} floor ${floorNumber}`;

  test(`${context}: all accessible destinations connect without crossing walls`, () => {
    const floor = routing.getFloor(buildingId, floorNumber);
    assert.ok(floor.rooms.length > 0 && floor.destinations.length > 1 && floor.walls.length > 0);
    const destinations = floor.destinations.filter(point => !(point.blockedFor || []).includes('wheelchair'));
    for (const point of destinations) {
      assert.ok(routing.isWalkable(floor, point), `${context}: destination ${point.id} is on a wall`);
    }
    for (let from = 0; from < destinations.length; from += 1) {
      for (let to = from + 1; to < destinations.length; to += 1) {
        const start = destinations[from];
        const end = destinations[to];
        assertSafeRoute(floor, start, end, routing.findRoute(floor, start, end),
          `${context}: ${start.id} to ${end.id}`);
      }
    }
  });

  test(`${context}: exact user positions inside rooms and corridors are used`, () => {
    const floor = routing.getFloor(buildingId, floorNumber);
    for (const room of floor.rooms) {
      const start = { x: room.x + room.width * 0.23, y: room.y + room.height * 0.27 };
      const end = floor.destinations.find(point => !(point.blockedFor || []).includes('wheelchair') &&
        (point.x < room.x || point.x > room.x + room.width ||
         point.y < room.y || point.y > room.y + room.height));
      assert.ok(end, `${context}: no destination outside ${room.label}`);
      assertSafeRoute(floor, start, end, routing.findRoute(floor, start, end),
        `${context}: arbitrary position inside ${room.label}`);
    }

    const end = floor.destinations.find(point => !(point.blockedFor || []).includes('wheelchair'));
    const starts = [{ x: 2.37, y: 38.19 }, { x: 97.13, y: 69.41 }, { x: 47.29, y: 95.73 }];
    for (const start of starts) {
      assertSafeRoute(floor, start, end, routing.findRoute(floor, start, end),
        `${context}: arbitrary corridor position ${JSON.stringify(start)}`);
    }
    const first = routing.findRoute(floor, starts[0], end);
    const second = routing.findRoute(floor, starts[1], end);
    assert.notDeepEqual(first.points, second.points, `${context}: changing location did not change the route`);
  });

  test(`${context}: a route to the current location has zero distance`, () => {
    const floor = routing.getFloor(buildingId, floorNumber);
    const start = { x: 2.37, y: 38.19 };
    const route = routing.findRoute(floor, start, { ...start });
    assertSafeRoute(floor, start, start, route, context);
    assert.equal(route.distance, 0);
  });

  test(`${context}: solid walls cannot be selected as origins or destinations`, () => {
    const floor = routing.getFloor(buildingId, floorNumber);
    const valid = floor.destinations.find(point => !(point.blockedFor || []).includes('wheelchair'));
    for (const wall of floor.walls) {
      const invalid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
      assert.equal(routing.isWalkable(floor, invalid), false, `${context}: wall midpoint accepted`);
      assert.equal(routing.findRoute(floor, invalid, valid), null, `${context}: origin inside wall accepted`);
      assert.equal(routing.findRoute(floor, valid, invalid), null, `${context}: destination inside wall accepted`);
    }
  });
}

test('stairs are unavailable to wheelchair routes, including coordinate-only targets', () => {
  const floor = routing.getFloor('campus', 2);
  const exit = floor.destinations.find(point => (point.blockedFor || []).includes('wheelchair'));
  assert.ok(exit, 'campus floor 2 must identify its stair exit');
  const start = floor.destinations.find(point => !(point.blockedFor || []).includes('wheelchair'));
  assert.equal(routing.findRoute(floor, start, exit, 'wheelchair'), null);
  assert.equal(routing.findRoute(floor, start, { x: exit.x, y: exit.y }, 'wheelchair'), null);
  for (const need of ['blind', 'deaf']) {
    assertSafeRoute(floor, start, exit, routing.findRoute(floor, start, exit, need), `${need} stair route`);
  }
});

test('nonfinite, missing, nonnumeric and out-of-map coordinates are rejected', () => {
  const floor = routing.getFloor('campus', 1);
  const valid = floor.destinations[0];
  const invalidPoints = [
    null, undefined, {}, { x: 50 }, { y: 50 }, { x: '50', y: 50 },
    { x: NaN, y: 50 }, { x: 50, y: NaN }, { x: Infinity, y: 50 },
    { x: 50, y: -Infinity }, { x: -1, y: 50 }, { x: 101, y: 50 },
    { x: 50, y: -1 }, { x: 50, y: 101 }
  ];
  for (const invalid of invalidPoints) {
    assert.equal(routing.isWalkable(floor, invalid), false);
    assert.equal(routing.findRoute(floor, invalid, valid), null);
    assert.equal(routing.findRoute(floor, valid, invalid), null);
  }
});

test('a room whose only doorway is closed reports no route', () => {
  const floor = routing.getFloor('campus', 1);
  const room = floor.rooms.find(item => item.id === 'classroom-a');
  floor.walls.push({
    x1: room.door.x - room.door.width / 2,
    y1: room.door.y,
    x2: room.door.x + room.door.width / 2,
    y2: room.door.y,
    roomId: room.id
  });
  const start = { ...room.target };
  const end = { x: 2.37, y: 38.19 };
  assert.equal(routing.isWalkable(floor, start), true);
  assert.equal(routing.isWalkable(floor, end), true);
  assert.equal(routing.findRoute(floor, start, end), null);
  assert.equal(routing.findRoute(floor, end, start), null);
});
