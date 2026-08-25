const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { subscriberSource, SUBSCRIBER_PATH, FIELDS } = require('../lib/medusa-subscriber.js');
const { storefront, MARKETS } = require('../lib/integrations-registry.js');

const URL = 'https://cloud.khaytapp.com/v1/shops/abc123/import/medusa';

test('the generated subscriber carries the shop\'s own import URL', () => {
  const src = subscriberSource(URL);
  assert.ok(src.includes(`const KHAYT_IMPORT_URL = "${URL}"`), 'URL is baked in');
  assert.ok(src.includes('event: "order.placed"'), 'listens to the right event');
  assert.ok(src.includes(SUBSCRIBER_PATH), 'names the file it should be saved as');
});

test('it fetches the order, because the event does not carry one', () => {
  // This is the whole reason Medusa needs code rather than a webhook URL:
  // order.placed hands a subscriber `{ id }`. A generated file that POSTed
  // `data` straight through would send Khayt an object with one property.
  const src = subscriberSource(URL);
  assert.ok(src.includes('SubscriberArgs<{ id: string }>'), 'typed as the id-only payload');
  assert.ok(src.includes('query.graph('), 'resolves the order before sending');
  assert.ok(src.includes('filters: { id: data.id }'));
  assert.ok(src.includes('JSON.stringify(order)'), 'sends the ORDER, not the event payload');
  assert.ok(!/body: JSON\.stringify\(data\)/.test(src), 'must not post the bare event payload');
});

test('every expandable field the mapper reads is requested', () => {
  // Medusa marks items and the addresses @expandable: a graph query that does
  // not name them returns an order without them, and the import lands with no
  // line items and no customer name. That failure looks like a Khayt bug and is
  // not one, so the field list is pinned here.
  const src = subscriberSource(URL);
  for (const f of ['items.*', 'shipping_address.*', 'billing_address.*', 'display_id', 'email']) {
    assert.ok(FIELDS.includes(f), `${f} in FIELDS`);
    assert.ok(src.includes(`"${f}"`), `${f} requested in the generated query`);
  }
});

test('a failed POST is logged, never thrown', () => {
  // A subscriber that throws is retried by Medusa. Until the import endpoint
  // rejects duplicates, a retry is a second order in the shop's queue — the
  // exact defect #745 fixed for Salla and Zid on the LAN side.
  const src = subscriberSource(URL);
  assert.ok(src.includes('try {') && src.includes('catch'), 'the POST is guarded');
  assert.ok(/logger\.error/.test(src), 'failure is reported');
  assert.ok(!/throw /.test(src), 'nothing rethrows, so Medusa does not retry into a duplicate');
});

test('the URL cannot break out of the string literal it is placed in', () => {
  // It is Khayt's own cloud URL, not a stranger's — but "it comes from our own
  // settings" is how injection bugs get argued for, and this file is handed to a
  // shop to run.
  const nasty = 'https://x/"; process.exit(1); const y = "';
  const src = subscriberSource(nasty);
  const line = src.split('\n').find((l) => l.startsWith('const KHAYT_IMPORT_URL'));
  assert.equal(line, 'const KHAYT_IMPORT_URL = "https://x/\\"; process.exit(1); const y = \\""');
  // And no newline can split the declaration across lines.
  assert.equal(subscriberSource('https://x/\n\ndelete-everything')
    .split('\n').filter((l) => l.includes('KHAYT_IMPORT_URL =')).length, 1);
});

test('junk in does not throw', () => {
  for (const v of [undefined, null, '', 0, {}, []]) {
    assert.equal(typeof subscriberSource(v), 'string', String(v));
  }
});

test('Medusa is offered in every market, and marked as needing code', () => {
  const sf = storefront('medusa');
  assert.ok(sf, 'registered');
  assert.equal(sf.name, 'Medusa');
  assert.deepEqual(sf.dir, ['in'], 'inbound only — Khayt does not publish a catalog to Medusa');
  assert.equal(sf.setup, 'subscriber', 'the directory uses this to offer the code button');

  // Self-hosted, so it is not a market's local platform — it is available in all
  // of them, and a shop switching the market selector should not lose it.
  for (const [loc, m] of Object.entries(MARKETS)) {
    assert.ok(m.storefronts.some((s) => s.id === 'medusa'), `medusa listed for ${loc}`);
  }
});

test('the renderer actually loads the module it calls', () => {
  // renderer/settings.js calls KhaytMedusa.subscriberSource; a global that is
  // never scripted in is a button that silently copies nothing.
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  assert.ok(html.includes('lib/medusa-subscriber.js'), 'script tag present');
  const settings = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'settings.js'), 'utf8');
  assert.ok(settings.includes('KhaytMedusa.subscriberSource'), 'the renderer uses it');
});
