"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { createAppServer, chatInput } = require("../../server/index.cjs");
const INTENT = { intent: "indoor", mallId: "delipark", floorId: "gf", originLabel: "concierge", facility: "toilet" };
function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function aiResponse(intent = INTENT) {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(intent) }] }] };
}

async function app(t, overrides = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "aksesin-server-test-"));
  await fs.mkdir(path.join(rootDir, "assets/images"), { recursive: true });
  await fs.mkdir(path.join(rootDir, ".git"));
  await fs.mkdir(path.join(rootDir, "js"));
  await fs.mkdir(path.join(rootDir, "server"));
  await Promise.all([
    fs.writeFile(path.join(rootDir, "aksesin.html"), "<!doctype html><h1>AKSESIN test fixture</h1>"),
    fs.writeFile(path.join(rootDir, "js/aksesin.js"), "window.testFixture = true;"),
    fs.writeFile(path.join(rootDir, "assets/images/sample.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    fs.writeFile(path.join(rootDir, "assets/images/sample.png"), "public image fixture"),
    fs.writeFile(path.join(rootDir, ".env"), "OPENAI_API_KEY=test-private-fixture"),
    fs.writeFile(path.join(rootDir, ".git/config"), "private git fixture"),
    fs.writeFile(path.join(rootDir, "server/index.cjs"), "private backend fixture")
  ]);
  const server = createAppServer({
    rootDir, apiKey: "",
    fetchImpl: async () => { throw new Error("Unexpected external request in offline test"); }, ...overrides
  });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(rootDir, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    rootDir, base, server,
    get: pathname => fetch(base + pathname),
    post: (pathname, body, headers = {}) => fetch(base + pathname, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body)
    })
  };
}

test("local server serves only public files and key-free health", async t => {
  const h = await app(t, { apiKey: "test-private-fixture" });
  const page = await h.get("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /AKSESIN test fixture/);
  assert.equal((await h.get("/assets/images/sample.svg")).status, 200);
  assert.equal((await h.get("/assets/images/sample.png")).status, 200);
  const health = await h.get("/api/health");
  assert.deepEqual(await health.json(), { aiEnabled: true, mode: "indoor", indoorPositioning: false });
  assert.equal(health.headers.get("cache-control"), "no-store");
  for (const file of ["/.env", "/.env.example", "/.git/config", "/server/index.cjs", "/package.json", "/assets/../server/index.cjs", "/assets/%2e%2e/.env", "/assets/images/.env.js", "/data/.env.js"]) {
    const result = await h.get(file);
    assert.equal(result.status, 404, file);
    assert.ok(!(await result.text()).includes("test-private-fixture"), file);
  }
});

test("public asset symlinks cannot expose secrets inside or outside the site root", async t => {
  const h = await app(t);
  await fs.symlink(path.join(h.rootDir, ".env"), path.join(h.rootDir, "assets/images/internal.js"));
  await fs.symlink(__filename, path.join(h.rootDir, "assets/images/external.js"));
  assert.equal((await h.get("/assets/images/internal.js")).status, 404);
  assert.equal((await h.get("/assets/images/external.js")).status, 404);
});

test("the reorganized public page serves all linked styles, scripts, and data", async t => {
  const h = await app(t, { rootDir: path.resolve(__dirname, "../../public") });
  const html = await (await h.get("/aksesin.html")).text();
  const files = [...html.matchAll(/(?:src|href)="((?:css|js|data)\/[^\"]+)"/g)].map(match => match[1]);
  assert.equal(files.length, 6);
  for (const file of files) assert.equal((await h.get("/" + file)).status, 200, file);
  for (const file of ["/README.md", "/docs/data-sources.md", "/server/index.cjs"]) {
    assert.equal((await h.get(file)).status, 404, file);
  }
});

test("cross-origin JSON, DNS rebinding hosts and unsupported methods cannot invoke services", async t => {
  let called = 0;
  const h = await app(t, { fetchImpl: async () => { called++; return response({}); } });
  assert.equal((await h.post("/api/route", {}, { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await h.post("/api/route", {}, { Origin: "null" })).status, 403);
  assert.equal((await h.post("/api/route", {}, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = http.get(h.base + "/api/health", { headers: { Host: "unrelated.example" } }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject);
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(h.base + "/api/route", { method: "OPTIONS" })).status, 405);
  assert.equal((await h.get("/api/route")).status, 404);
  assert.equal(called, 0);
});

test("API body validation rejects wrong content type, malformed JSON and declared oversize", async t => {
  const h = await app(t);
  assert.equal((await h.post("/api/chat", { message: "hello" }, { "content-type": "text/plain" })).status, 415);
  assert.equal((await fetch(h.base + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await h.post("/api/chat", { message: "a".repeat(9000) })).status, 413);
});

function streamedPost(base, chunks, end = true) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + "/api/chat", { method: "POST", headers: { "content-type": "application/json" } }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => { resolve({ status: res.statusCode, body: JSON.parse(text) }); req.destroy(); });
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    if (end) req.end();
  });
}

test("chunked bodies cannot evade the size limit and stalled upload handlers expire", async t => {
  const h = await app(t, { bodyTimeoutMs: 30 });
  const tooLarge = await streamedPost(h.base, ["{\"message\":\"", "a".repeat(9000), "\"}"]);
  assert.equal(tooLarge.status, 413);
  const stalled = await streamedPost(h.base, ["{\"message\":"], false);
  assert.equal(stalled.status, 408);
  assert.equal(stalled.body.code, "BODY_TIMEOUT");
  assert.equal((await h.get("/api/health")).status, 200);
});

test('road routing is retired and cannot send coordinates upstream', async t => {
  let called = false;
  const h = await app(t, { fetchImpl: async () => { called = true; throw Error('no'); } });
  const result = await h.post('/api/route', { origin: { lat: 3.58, lon: 98.67 } });
  assert.equal(result.status, 410); assert.equal((await result.json()).code, 'INDOOR_ONLY'); assert.equal(called, false);
});
test('unconfigured AI returns honest local fallback; contradictory mall requests never call AI', async t => {
  let count = 0;
  const fetchImpl = async () => { count++; throw Error('no'); };
  const h = await app(t, { fetchImpl });
  const result = await (await h.post('/api/chat', { message: 'Bantu cari toilet' })).json();
  assert.equal(result.source, 'local'); assert.equal(result.intent, 'unknown'); assert.equal(result.floorId, null);
  const enabled = await app(t, { apiKey: 'test-key', fetchImpl });
  for (const message of ['dari Sun Plaza ke Delipark', 'toilet bukan di Delipark']) {
    assert.equal((await (await enabled.post('/api/chat', { message })).json()).source, 'local');
  }
  assert.equal(count, 0);
});
test('configured AI extracts only indoor intent and never receives GPS fields', async t => {
  let captured;
  const h = await app(t, { apiKey: 'test-secret-key', fetchImpl: async (url, options) => { captured = { url, options }; return response(aiResponse()); } });
  const result = await (await h.post('/api/chat', { message: 'Aku di GF dekat concierge Delipark mau ke toilet', context: { mallId: 'delipark', floorId: 'gf', originLabel: 'concierge', facility: 'toilet', lat: 3.58912, lon: 98.67512, other: 'private-extra' } })).json();
  assert.deepEqual(result, { ...INTENT, source: 'openai' });
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-secret-key');
  const sent = JSON.parse(captured.options.body);
  assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true);
  assert.equal(sent.text.format.schema.additionalProperties, false);
  for (const forbidden of ['3.58912', '98.67512', 'private-extra', 'test-secret-key']) assert.ok(!captured.options.body.includes(forbidden));
  assert.ok(!Object.hasOwn(sent.text.format.schema.properties, 'directions'));
});
test('invalid floors, unsupported fields, refusals and incomplete AI responses fall back', async t => {
  for (const payload of [aiResponse({ ...INTENT, mallId: 'unknown' }), aiResponse({ ...INTENT, floorId: 'l4' }), aiResponse({ ...INTENT, directions: 'go left' }), aiResponse({ ...INTENT, originLabel: 'x'.repeat(121) }), { ...aiResponse(), status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }]) {
    const h = await app(t, { apiKey: 'test-key', fetchImpl: async () => response(payload) });
    const result = await (await h.post('/api/chat', { message: 'Bantu cari toilet' })).json();
    assert.equal(result.source, 'local'); assert.equal(result.originLabel, null); assert.ok(result.notice);
  }
});
test('AI failure or timeout does not leak secrets or invent location', async t => {
  let signal;
  const h = await app(t, { apiKey: 'test-key', upstreamTimeoutMs: 25, fetchImpl: (url, options) => { signal = options.signal; return new Promise(() => {}); } });
  const result = await (await h.post('/api/chat', { message: 'tolong bantu saya' })).json();
  assert.equal(signal.aborted, true); assert.equal(result.source, 'local'); assert.equal(result.mallId, null);
  const denied = await app(t, { apiKey: 'test-key', fetchImpl: async () => response({ error: 'provider-secret' }, 401) });
  const fail = await (await denied.post('/api/chat', { message: 'tolong bantu saya' })).json();
  assert.equal(fail.source, 'local'); assert.ok(!JSON.stringify(fail).includes('provider-secret'));
});
test('chat validates message size and strips unknown context and precise coordinates', () => {
  for (const value of [null, {}, { message: '' }, { message: 2 }, { message: 'a'.repeat(601) }]) assert.throws(() => chatInput(value), e => e.status === 400);
  assert.deepEqual(chatInput({ message: 'Cari lift', context: { mallId: 'bad', floorId: 'gf', facility: 'bad', lat: 3 } }).context, { mallId: null, floorId: null, originLabel: null, facility: null });
  const input = chatInput({ message: '3.58912, 98.67512', context: { originLabel: '3.58912, 98.67512' } });
  assert.ok(!JSON.stringify(input).includes('3.58912'));
});
test('AI cannot invent an origin, infer current floor from a destination, or move old position across malls', async t => {
  for (const [message, context, intent] of [
    ['Saya di GF Delipark mau ke toilet', {}, { ...INTENT, originLabel: 'toko rekaan' }],
    ['Cari toilet di GF Delipark', {}, { ...INTENT, originLabel: null }],
    ['Lift di Sun Plaza', { mallId: 'delipark', floorId: 'gf', originLabel: 'concierge' }, { ...INTENT, mallId: 'sun-plaza', facility: 'lift' }]
  ]) {
    const h = await app(t, { apiKey: 'test-key', fetchImpl: async () => response(aiResponse(intent)) });
    const result = await (await h.post('/api/chat', { message, context })).json();
    assert.equal(result.source, 'local'); assert.equal(result.originLabel, null); assert.equal(result.floorId, null);
  }
});
