const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../public/js/indoor.js');
const state = { mallId: 'delipark', floorId: 'gf', originLabel: 'concierge', facility: 'toilet' };
const unknown = { intent: 'unknown', mallId: null, floorId: null, originLabel: null, facility: null };
test('floor choices retain official provenance; no invented plan or graph', () => {
  assert.ok(I.getFloors('delipark').every(f => f.sourceUrl === 'https://delipark.com/MapDir'));
  assert.deepEqual(I.getFloors('sun-plaza').map(f => f.id), ['gf', 'ug', 'l1']);
  assert.deepEqual(I.FLOORPLANS, {}); assert.equal(I.getFloor('sun-plaza', 'l5'), null);
  assert.deepEqual(I.getFloors('__proto__'), []);
});
test('natural indoor request extracts current floor and destination facility', () => {
  assert.deepEqual(I.parseMessage('Aku di GF Delipark, mau ke toilet difabel'), { intent: 'indoor', mallId: 'delipark', floorId: 'gf', originLabel: null, facility: 'toilet' });
  const result = I.parseMessage('Aku di GF dekat concierge, mau ke toilet', { mallId: 'delipark' });
  assert.equal(result.floorId, 'gf'); assert.match(result.originLabel, /concierge/); assert.equal(result.facility, 'toilet');
  assert.equal(I.parseMessage('dari concierge ke lift', state).originLabel, 'concierge');
});
test('explicit mall changes discard previous floor and origin', () => {
  assert.deepEqual(I.parseMessage('Lift di Sun Plaza', state), { intent: 'indoor', mallId: 'sun-plaza', floorId: null, originLabel: null, facility: 'lift' });
  assert.equal(I.parseMessage('Sun Plaza', state).originLabel, null);
});
test('explicit new floor or landmark cannot reuse an old physical position', () => {
  const floor = I.parseMessage('Aku sekarang di lantai 2', state);
  assert.equal(floor.floorId, 'l2'); assert.equal(floor.originLabel, null);
  const origin = I.parseMessage('Aku di dekat Starbucks', state);
  assert.equal(origin.floorId, null); assert.equal(origin.originLabel, 'starbucks');
  const numbered = I.parseMessage('Aku di pintu 1', state);
  assert.equal(numbered.floorId, null); assert.equal(numbered.originLabel, 'pintu 1');
});
test('destination floor never becomes current floor and followup changes requested facility', () => {
  const result = I.parseMessage('toilet di lantai 2', state);
  assert.equal(result.floorId, 'gf'); assert.equal(result.originLabel, 'concierge');
  assert.equal(I.parseMessage('lift', state).facility, 'lift');
  assert.equal(I.parseMessage('peminjaman kursi roda', state).facility, 'wheelchair');
  assert.equal(I.parseMessage('parkir difabel', state).facility, 'parking');
});
test('unsupported travel, ambiguity and negations cannot manufacture an indoor route', () => {
  for (const message of ['dari Sun Plaza ke Delipark', 'toilet di Delipark atau Sun Plaza', 'bukan toilet', 'jangan ke lift', 'toilet dan lift', 'dari rumah ke Sun Plaza', 'toilet di Centre Point', 'aku di lantai 99', 'abcdef']) assert.deepEqual(I.parseMessage(message, state), unknown, message);
});
test('help and invalid inputs never retain location', () => {
  assert.equal(I.parseMessage('gps', state).intent, 'help');
  for (const text of [null, 123, {}, '', 'a'.repeat(601)]) assert.deepEqual(I.parseMessage(text, state), unknown);
});
