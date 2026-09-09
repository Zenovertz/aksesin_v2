"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../aksesin-data.js");
const Routing = require("../aksesin-routing.js");

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[Data.STORAGE_KEY, initialValue]]);
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

function values(overrides = {}) {
  return {
    pathId: "campus-ramp", author: "Ayu", need: "wheelchair", rating: 4,
    condition: "available", comment: "Jalur lebar dan ramp dapat digunakan.", photo: "", ...overrides
  };
}

function report(overrides = {}) {
  return {
    id: "local-report", ...values(), createdAt: "2026-09-09T09:00:00.000Z", demo: false, ...overrides
  };
}

test("each mapped path stays outside rooms and every segment avoids all walls", () => {
  for (const path of Data.PATHS) {
    const floor = Routing.getFloor(path.buildingId, path.floor);
    assert.ok(path.points.length >= 2, path.id);
    for (let index = 0; index < path.points.length; index++) {
      const point = path.points[index];
      assert.ok(Routing.isWalkable(floor, point), `${path.id}: point ${index}`);
      assert.ok(!floor.rooms.some(room => !room.open && point.x > room.x && point.x < room.x + room.width
        && point.y > room.y && point.y < room.y + room.height), `${path.id}: no room destination`);
      if (index) assert.ok(Routing.isSegmentWalkable(floor, path.points[index - 1], point), `${path.id}: segment ${index}`);
    }
  }
});

test("both buildings have real alternatives for every supported need on both floors", () => {
  for (const building of Data.BUILDINGS) {
    for (const need of Data.NEEDS) {
      for (const floor of [1, 2]) {
        const state = Data.defaultState();
        state.prefs = { ...state.prefs, building: building.id, need: need.id, floor };
        const recommendations = Data.recommend(state, { floor });
        assert.ok(recommendations.length > 0, `${building.id}/${need.id}/${floor}`);
        assert.ok(recommendations.every(path => path.buildingId === building.id && path.floor === floor
          && path.supports.includes(need.id) && path.summary.condition !== "blocked"));
      }
    }
  }
});

test("wheelchair recommendations contain only step-free, wide paths and avoid stair exits", () => {
  for (const path of Data.PATHS.filter(path => path.supports.includes("wheelchair"))) {
    assert.equal(path.features.stepFree, true, path.id);
    assert.equal(path.features.wide, true, path.id);
    if (path.condition !== "blocked") {
      const floor = Routing.getFloor(path.buildingId, path.floor);
      const forbidden = floor.facilities.filter(item => item.blockedFor.includes("wheelchair"));
      assert.ok(path.points.every(point => forbidden.every(item => item.x !== point.x || item.y !== point.y)), path.id);
    }
  }
});

test("blind and deaf recommendations include their respective access features", () => {
  for (const path of Data.PATHS) {
    if (path.supports.includes("blind")) assert.equal(path.features.tactile, true, path.id);
    if (path.supports.includes("deaf")) assert.equal(path.features.visualSigns, true, path.id);
  }
});

test("initial wheelchair view offers available and caution paths, never blocked paths", () => {
  const paths = Data.recommend(Data.defaultState(), { floor: 1 });
  assert.deepEqual(paths.map(path => path.id), ["campus-ramp", "campus-visual"]);
  assert.deepEqual(paths.map(path => path.summary.condition), ["available", "caution"]);
  assert.ok(paths.every(path => path.reasons.length > 0));
});

test("changing the selected need changes actual eligibility", () => {
  const state = Data.defaultState();
  state.prefs.need = "blind";
  assert.deepEqual(Data.recommend(state, { floor: 1 }).map(path => path.id), ["campus-tactile"]);
});

test("structured obstacles are extracted without changing the selected need", () => {
  const state = Data.defaultState();
  state.prefs.complaint = "Saya sulit mendengar, takut tangga, sempit, licin, gelap, perlu pemandu dan rambu.";
  assert.deepEqual(Data.parseComplaint(state.prefs.complaint), ["stepFree", "wide", "nonSlip", "lit", "tactile", "visualSigns"]);
  Data.recommend(state);
  assert.equal(state.prefs.need, "wheelchair");
  assert.deepEqual(Data.parseComplaint("Keluhan lutut saya sakit"), []);
});

test("slippery-surface complaint excludes a corridor without an antislip surface", () => {
  const state = Data.defaultState();
  state.prefs.complaint = "Saya khawatir jalurnya LICIN saat basah";
  const paths = Data.recommend(state, { floor: 1 });
  assert.deepEqual(paths.map(path => path.id), ["campus-ramp"]);
  assert.ok(paths[0].reasons.some(reason => reason.includes("antiselip")));
});

test("narrow and dark corridor complaints produce an honest empty result on an incompatible floor", () => {
  for (const complaint of ["jalur sempit", "penerangan gelap"]) {
    const state = Data.defaultState();
    state.prefs.need = "blind";
    state.prefs.complaint = complaint;
    assert.deepEqual(Data.recommend(state, { floor: 1 }), []);
    assert.deepEqual(Data.recommend(state, { floor: 2 }).map(path => path.id), ["campus-gallery"]);
  }
});

test("all complaint constraints must be satisfied simultaneously", () => {
  const state = Data.defaultState();
  state.prefs.complaint = "tanpa tangga, tidak sempit, antiselip, penerangan baik, ada pemandu dan rambu";
  assert.deepEqual(Data.recommend(state).map(path => path.id), ["campus-gallery"]);
});

test("a blocked user report immediately removes a previously recommended path", () => {
  const state = Data.defaultState();
  state.reports.push(report({ condition: "blocked", comment: "Ramp tertutup barang dan tidak dapat dilewati." }));
  assert.equal(Data.summarize("campus-ramp", state).condition, "blocked");
  assert.ok(Data.recommend(state).every(path => path.id !== "campus-ramp"));
});

test("a newer available report restores a blocked path and an older report cannot override it", () => {
  const state = Data.defaultState();
  state.reports = [
    report({ id: "restored", condition: "available", createdAt: "2026-09-09T10:00:00.000Z" }),
    report({ id: "blocked", condition: "blocked", createdAt: "2026-09-09T09:00:00.000Z" })
  ];
  const summary = Data.summarize("campus-ramp", state);
  assert.equal(summary.condition, "available");
  assert.equal(summary.latestReport.id, "restored");
  assert.equal(summary.lastUpdated, "2026-09-09T10:00:00.000Z");
  assert.ok(Data.recommend(state).some(path => path.id === "campus-ramp"));
});

test("same-millisecond reports keep the last submission first after sanitization and reload", () => {
  const first = Data.addReport(Data.defaultState(), values({ condition: "blocked" }));
  const second = Data.addReport(first.state, values({ condition: "available" }));
  const timestamp = "2026-09-09T10:00:00.000Z";
  second.state.reports.forEach(item => { item.createdAt = timestamp; });
  const storage = memoryStorage();
  Data.saveState(second.state, storage);
  const restored = Data.loadState(storage).state;
  assert.deepEqual(restored.reports.map(item => item.id), [second.report.id, first.report.id]);
  assert.equal(Data.summarize("campus-ramp", restored).latestReport.id, second.report.id);
  assert.equal(Data.summarize("campus-ramp", restored).condition, "available");
});

test("a restored maintenance path re-enters matching recommendations", () => {
  const state = Data.defaultState();
  state.reports.push(report({ pathId: "campus-maintenance", condition: "available" }));
  assert.ok(Data.recommend(state, { floor: 2 }).some(path => path.id === "campus-maintenance"));
});

test("comments aggregate ratings and clearly separate demo comments from local comments", () => {
  const state = Data.defaultState();
  state.reports = [report({ rating: 2 })];
  const summary = Data.summarize("campus-ramp", state);
  assert.equal(summary.count, 2);
  assert.equal(summary.rating, 3);
  const reports = Data.getReports(state, "campus-ramp");
  assert.equal(reports[0].demo, false);
  assert.equal(reports[1].demo, true);
  assert.match(reports[1].comment, /Contoh laporan/);
});

test("saved blocked paths remain available for viewing while recommendations exclude them", () => {
  const state = Data.defaultState();
  state.savedPathIds.push("campus-maintenance");
  assert.deepEqual(Data.sanitizeState(state).savedPathIds, ["campus-maintenance"]);
  assert.equal(Data.getPath("campus-maintenance").name, "Jalur sisi timur");
  assert.ok(Data.recommend(state).every(path => path.id !== "campus-maintenance"));
});

test("valid report creation trims input, generates an ID and records current time", () => {
  const before = Date.now();
  const result = Data.createReport(values({ author: "  Ayu  ", comment: "  Jalur dapat digunakan.  " }));
  assert.deepEqual(result.errors, {});
  assert.equal(result.report.author, "Ayu");
  assert.equal(result.report.comment, "Jalur dapat digunakan.");
  assert.ok(result.report.id);
  assert.equal(result.report.demo, false);
  assert.ok(Date.parse(result.report.createdAt) >= before);
});

test("report validation rejects missing or invalid path, author, need, rating, status and comment", () => {
  for (const [field, value] of [["pathId", "missing"], ["author", "  "], ["need", "diagnosis"], ["rating", 0],
    ["rating", 6], ["rating", 2.5], ["rating", "5"], ["condition", "unknown"], ["comment", "123456789"],
    ["comment", "a".repeat(1001)]]) {
    const result = Data.createReport(values({ [field]: value }));
    assert.equal(result.report, null, field);
    assert.ok(result.errors[field], `${field}: ${value}`);
  }
});

test("report and draft comment limits match the 10 to 1000 character form", () => {
  assert.deepEqual(Data.createReport(values({ comment: "1234567890" })).errors, {});
  assert.deepEqual(Data.createReport(values({ comment: "a".repeat(1000) })).errors, {});
  const state = Data.defaultState();
  state.reports = [report({ comment: "a".repeat(1200) }), report({ id: "short", comment: "123456789" })];
  state.draft.comment = "b".repeat(1200);
  const clean = Data.sanitizeState(state);
  assert.equal(clean.reports.length, 1);
  assert.equal(clean.reports[0].comment.length, 1000);
  assert.equal(clean.draft.comment.length, 1000);
});

test("addReport adds a report and clears the draft while preserving identity and input state", () => {
  const state = Data.defaultState();
  state.draft.comment = "Komentar masih ditulis";
  const result = Data.addReport(state, values());
  assert.equal(result.state.reports.length, 1);
  assert.equal(result.state.draft.comment, "");
  assert.equal(result.state.draft.author, "Ayu");
  assert.equal(state.reports.length, 0);
  assert.equal(state.draft.comment, "Komentar masih ditulis");
});

test("invalid report submission leaves the draft and existing reports intact", () => {
  const state = Data.defaultState();
  state.draft.comment = "Masih menulis";
  const result = Data.addReport(state, values({ rating: 0 }));
  assert.equal(result.report, null);
  assert.equal(result.state.draft.comment, "Masih menulis");
  assert.deepEqual(result.state.reports, []);
});

test("preferences, saved paths, reports and unfinished draft survive a storage reload", () => {
  const storage = memoryStorage();
  const state = Data.defaultState();
  state.prefs = { building: "hospital", need: "blind", floor: 2, complaint: "Perlu pemandu" };
  state.savedPathIds = ["hospital-gallery"];
  state.reports = [report({ pathId: "hospital-gallery", need: "blind" })];
  state.draft = { pathId: "hospital-tactile", author: "Ayu", need: "blind", rating: 3, condition: "caution", comment: "Draf belum dikirim", photo: "data:image/png;base64,aGVsbG8=" };
  const saved = Data.saveState(state, storage);
  assert.equal(saved.saved, true);
  assert.deepEqual(Data.loadState(storage).state, state);
  assert.equal(JSON.parse(storage.getItem(Data.STORAGE_KEY)).reports.length, 1, "demo reports are not persisted");
});

test("empty storage starts with safe defaults", () => {
  const loaded = Data.loadState(memoryStorage());
  assert.equal(loaded.saved, true);
  assert.deepEqual(loaded.state, Data.defaultState());
});

test("bad JSON is reported without destroying the stored value", () => {
  const storage = memoryStorage("{broken");
  const loaded = Data.loadState(storage);
  assert.equal(loaded.saved, false);
  assert.equal(loaded.error, "invalid-data");
  assert.deepEqual(loaded.state, Data.defaultState());
  assert.equal(storage.getItem(Data.STORAGE_KEY), "{broken");
});

test("unknown state versions are not interpreted as current application data", () => {
  const loaded = Data.loadState(memoryStorage(JSON.stringify({ ...Data.defaultState(), version: 999 })));
  assert.equal(loaded.error, "invalid-data");
  assert.deepEqual(loaded.state, Data.defaultState());
});

test("invalid storage fields are discarded while valid preferences and reports are recovered", () => {
  const raw = {
    version: 1, prefs: { building: "hospital", need: "not-a-need", floor: 99, complaint: "  Perlu ramp  " },
    savedPathIds: ["hospital-ramp", "does-not-exist", "hospital-ramp"],
    reports: [report(), report({ id: "bad-rating", rating: 99 }), report({ id: "bad-date", createdAt: "wrong" }),
      report({ id: "bad-path", pathId: "missing" }), report({ id: "bad-future", createdAt: "2099-01-01T00:00:00Z" }),
      report({ id: "demo-spoofed", demo: true }), report()],
    draft: { pathId: "missing", author: "  Ayu  ", need: "bad", rating: -1, condition: "bad", comment: 23, photo: "javascript:alert(1)" }
  };
  const clean = Data.sanitizeState(raw);
  assert.deepEqual(clean.prefs, { building: "hospital", need: "wheelchair", floor: 1, complaint: "Perlu ramp" });
  assert.deepEqual(clean.savedPathIds, ["hospital-ramp"]);
  assert.equal(clean.reports.length, 1);
  assert.deepEqual(clean.draft, { pathId: "", author: "Ayu", need: "wheelchair", rating: 0, condition: "available", comment: "", photo: "" });
});

test("invalid photos cannot introduce remote URLs or executable SVG content", () => {
  for (const photo of ["https://example.com/a.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGgxPg==", "data:image/jpeg;base64,not valid", "data:image/png;base64," + "a".repeat(Data.MAX_PHOTO_LENGTH)]) {
    assert.equal(Data.validPhoto(photo), false);
    assert.ok(Data.createReport(values({ photo })).errors.photo);
    const clean = Data.sanitizeState({ ...Data.defaultState(), reports: [report({ photo })] });
    assert.equal(clean.reports[0].photo, "");
  }
  for (const type of ["png", "jpeg", "webp"]) assert.equal(Data.validPhoto(`data:image/${type};base64,aGVsbG8=`), true);
});

test("quota failures preserve all unsaved data in memory and return a useful status", () => {
  const state = Data.defaultState();
  state.prefs.complaint = "Perlu jalur lebar";
  state.reports = [report()];
  const storage = { setItem() { const error = new Error("Quota"); error.name = "QuotaExceededError"; throw error; } };
  const saved = Data.saveState(state, storage);
  assert.equal(saved.saved, false);
  assert.equal(saved.error, "storage-full");
  assert.deepEqual(saved.state, state);
});

test("storage access failures are handled without crashing", () => {
  const denied = { getItem() { throw new Error("Access denied"); }, setItem() { throw new Error("Access denied"); } };
  assert.equal(Data.loadState(denied).error, "storage-unavailable");
  assert.equal(Data.saveState(Data.defaultState(), denied).error, "storage-unavailable");
  assert.equal(Data.loadState(null).error, "storage-unavailable");
  assert.equal(Data.saveState(Data.defaultState(), null).error, "storage-unavailable");
});

test("report retention is bounded and keeps the newest reports", () => {
  const state = Data.defaultState();
  state.reports = Array.from({ length: Data.MAX_REPORTS + 10 }, (_, index) => report({
    id: `retention-${index}`, createdAt: new Date(Date.UTC(2026, 8, 8, 0, index)).toISOString()
  }));
  const clean = Data.sanitizeState(state);
  assert.equal(clean.reports.length, Data.MAX_REPORTS);
  assert.equal(clean.reports[0].id, `retention-${Data.MAX_REPORTS + 9}`);
});

test("read and recommendation operations do not mutate application state", () => {
  const state = Data.defaultState();
  state.reports = [report()];
  const original = structuredClone(state);
  Data.recommend(state);
  Data.getReports(state);
  Data.summarize("campus-ramp", state);
  assert.deepEqual(state, original);
  assert.equal(Data.getPath("missing"), null);
  assert.equal(Data.summarize("missing", state), null);
});
