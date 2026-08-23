/**
 * The presets exist to stop a shop mistyping an endpoint, so the thing worth
 * testing is that they cannot themselves introduce one.
 *
 * Two failure modes drive most of this file:
 *
 *   1. A round trip that does not close. Settings renders the saved endpoint,
 *      the shop edits an unrelated field, the form saves — and if detect() and
 *      extractVars() do not agree with resolveEndpoint(), that save rewrites a
 *      working endpoint into a broken one. Nobody would connect the outage to
 *      the field they actually touched.
 *
 *   2. A template that looks plausible and is wrong. IDrive e2 issues per-account
 *      hosts and Synology moved domains; both were caught only by checking, and a
 *      test is what keeps a future "tidy-up" from re-guessing them.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../lib/storage-providers.js');

test('every provider is internally consistent', () => {
  const seen = new Set();
  for (const p of SP.PROVIDERS) {
    assert.ok(p.id && !seen.has(p.id), `duplicate or missing id: ${p.id}`);
    seen.add(p.id);
    assert.ok(p.label, `${p.id} needs a label`);
    // Every {placeholder} in the template must have a var to fill it, or the
    // endpoint ships to the bucket with a literal brace in the hostname.
    const holes = [...String(p.endpoint || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const keys = p.vars.map((v) => v.key);
    for (const h of holes) assert.ok(keys.includes(h), `${p.id}: {${h}} has no var`);
    for (const k of keys) assert.ok(holes.includes(k) || k === 'region', `${p.id}: var ${k} fills nothing`);
    for (const v of p.vars) assert.ok(v.label && v.hint, `${p.id}.${v.key} needs a label and a hint`);
  }
});

test('resolveEndpoint fills the template', () => {
  const r = SP.resolveEndpoint('r2', { account: 'abc123' });
  assert.equal(r.ok, true);
  assert.equal(r.endpoint, 'https://abc123.r2.cloudflarestorage.com');
  assert.equal(r.region, 'auto');
});

test('a region in the hostname is also the signing region', () => {
  // B2 signs against the region in its host. Defaulting to 'auto' here produces
  // a signature mismatch that the shop reads as a bad secret, and they go and
  // re-copy a key that was never wrong.
  const r = SP.resolveEndpoint('b2', { region: 'us-west-004' });
  assert.equal(r.endpoint, 'https://s3.us-west-004.backblazeb2.com');
  assert.equal(r.region, 'us-west-004');
});

test('missing variables are all reported at once, not one per attempt', () => {
  const r = SP.resolveEndpoint('oci', {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ['namespace', 'region']);
  assert.match(r.error, /namespace/i);
  assert.match(r.error, /region/i);
});

test('providers without a template keep the endpoint the shop typed', () => {
  // The regression this guards: returning '' for these wiped a working endpoint
  // whenever any other field on the Settings page was saved.
  for (const id of ['custom', 'idrive']) {
    const r = SP.resolveEndpoint(id, { endpoint: 'https://r4a6.or5.idrivee2-75.com' });
    assert.equal(r.ok, true, id);
    assert.equal(r.endpoint, 'https://r4a6.or5.idrivee2-75.com', id);
  }
});

test('unknown provider is refused rather than guessed at', () => {
  assert.equal(SP.resolveEndpoint('dropbox', {}).ok, false);
});

test('detect recognises each templated provider from its own endpoint', () => {
  for (const p of SP.PROVIDERS) {
    if (!p.endpoint) continue;
    const filled = p.endpoint.replace(/\{\w+\}/g, 'x1');
    assert.equal(SP.detect(filled), p.id, `${p.id} did not recognise ${filled}`);
  }
});

test('detect handles e2 hosts, whose domain carries a varying number', () => {
  assert.equal(SP.detect('https://r4a6.or5.idrivee2-75.com'), 'idrive');
  assert.equal(SP.detect('https://u6a5.bn.idrivee2-61.com'), 'idrive');
  assert.equal(SP.detect('https://s3.us-west-2.idrivee2.com'), 'idrive');
});

test('a NAS is called a NAS, so its one caveat can be shown', () => {
  // 'custom' would hide the note about the copy being in the same building.
  assert.equal(SP.detect('http://192.168.1.20:9000'), 'minio');
  assert.equal(SP.detect('http://nas.local:9000'), 'minio');
  assert.equal(SP.detect('http://truenas:9000'), 'minio');
});

test('detect falls back to custom, and says nothing about nothing', () => {
  assert.equal(SP.detect('https://storage.example.co.uk'), 'custom');
  assert.equal(SP.detect(''), '');
  assert.equal(SP.detect(null), '');
});

test('extractVars round-trips resolveEndpoint for every templated provider', () => {
  // This closes the loop that Settings depends on: render → edit → save must
  // land on the same endpoint it started from.
  for (const p of SP.PROVIDERS) {
    if (!p.endpoint || !p.vars.length) continue;
    const vars = Object.fromEntries(p.vars.map((v, i) => [v.key, `v${i}${p.id}`]));
    const built = SP.resolveEndpoint(p.id, vars);
    assert.equal(built.ok, true, p.id);
    assert.deepEqual(SP.extractVars(p.id, built.endpoint), vars, `${p.id} did not round-trip`);
  }
});

test('extractVars does not mistake a different provider for this one', () => {
  assert.deepEqual(SP.extractVars('r2', 'https://s3.eu-central-1.amazonaws.com'), {});
});

test('the prices carry the date they were checked', () => {
  // A figure with no date is a figure nobody can tell is stale.
  assert.match(SP.PRICED_ON, /^\d{4}-\d{2}-\d{2}$/);
});

test('Wasabi is listed with its minimums, not quietly omitted', () => {
  // It was left off an earlier draft. A shop will find it anyway, and the two
  // minimums are the whole story below 1 TB.
  const w = SP.byId('wasabi');
  assert.ok(w, 'wasabi should be offered');
  assert.match(w.note, /1 TB minimum/i);
  assert.match(w.note, /90/);
});
