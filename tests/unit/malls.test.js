const test = require('node:test');
const assert = require('node:assert/strict');
const malls = require('../../public/data/malls.js');
const utils = require('../../public/js/utils.js');

test('both Medan venues identify provenance and approximate venue coordinates', () => {
  assert.deepEqual(malls.MALLS.map(mall => mall.id), ['delipark', 'sun-plaza']);
  for (const mall of malls.MALLS) {
    assert.ok(utils.inMedan(mall));
    assert.equal(mall.checkedAt, '2026-09-12');
    assert.match(mall.coordinatesSource, /^https:\/\//);
    assert.match(mall.coordinatesLabel, /Perkiraan.*pintu masuk aksesibel belum dipetakan/);
    assert.match(mall.website, /^https:\/\//);
    assert.match(mall.address, /Medan/);
    assert.deepEqual(mall.facilities.map(item => item.id), ['toilet', 'lift', 'entrance', 'parking', 'wheelchair']);
    assert.ok(mall.facilities.every(item => ['published', 'unknown'].includes(item.status)
      && /^https:\/\//.test(item.sourceUrl) && item.detail && (item.location === null || typeof item.location === 'string')));
  }
  assert.equal(malls.getMall('missing'), null);
  assert.equal(malls.getMall('__proto__'), null);
});

test('published facilities and unresolved accessibility details remain distinct', () => {
  const deli = malls.getMall('delipark');
  const sun = malls.getMall('sun-plaza');
  const get = (mall, id) => mall.facilities.find(item => item.id === id);
  assert.equal(get(deli, 'entrance').status, 'unknown');
  assert.equal(get(deli, 'parking').status, 'unknown');
  assert.equal(get(deli, 'lift').status, 'unknown', 'an image filename alone must not verify lift accessibility');
  assert.equal(get(deli, 'toilet').location, 'Setiap lantai');
  assert.equal(get(deli, 'wheelchair').location, 'Concierge, GF');
  assert.equal(get(sun, 'lift').status, 'published');
  assert.equal(get(sun, 'parking').location, 'UG & L1');
  assert.equal(get(sun, 'wheelchair').location, 'GF (Zone C) Floor');
  assert.equal(get(sun, 'toilet').location, 'All Toilet');
  assert.equal(get(sun, 'entrance').location, 'All Car Parks');
  assert.equal(get(sun, 'lift').location, 'All Areas');
  assert.equal(sun.phone, null, 'an old telephone listing must not become a current verified contact');
  assert.equal(sun.phoneHref, null);
});

test('normalization cleans punctuation without dropping route or negation terms', () => {
  assert.equal(utils.normalize(' Saya DARI DeliPark, KE Sun Plaza! '), 'saya dari delipark ke sun plaza');
  assert.equal(utils.normalize('Jangan ke DeliPark'), 'jangan ke delipark');
  for (const value of [null, undefined, {}, 12]) assert.equal(utils.normalize(value), '');
});

test('distance is finite, symmetric, and expressed in real meters', () => {
  const [deli, sun] = malls.MALLS;
  const value = utils.distanceMeters(deli, sun);
  assert.ok(value > 1200 && value < 1600);
  assert.equal(value, utils.distanceMeters(sun, deli));
  assert.equal(utils.distanceMeters(deli, deli), 0);
  assert.ok(Math.abs(utils.distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 1);
  assert.ok(Number.isFinite(utils.distanceMeters({ lat: 90, lon: 0 }, { lat: -90, lon: 180 })));
  for (const point of [null, {}, { lat: '3.5', lon: 98.6 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: NaN, lon: 0 }]) {
    assert.throws(() => utils.distanceMeters(point, deli), TypeError);
    assert.equal(utils.inMedan(point), false);
  }
});

test('Medan coverage bounds include edges and reject every outside edge', () => {
  for (const lat of [3.35, 3.9]) for (const lon of [98.45, 98.9]) assert.equal(utils.inMedan({ lat, lon }), true);
  for (const point of [{ lat: 3.34999, lon: 98.6 }, { lat: 3.90001, lon: 98.6 },
    { lat: 3.5, lon: 98.44999 }, { lat: 3.5, lon: 98.90001 }]) assert.equal(utils.inMedan(point), false);
});
