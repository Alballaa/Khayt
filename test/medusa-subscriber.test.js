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
  // It posts `payload` — the order with the product's material folded onto each
  // line and the product object dropped. Still the order, not the event.
  assert.ok(src.includes('JSON.stringify(payload)'), 'sends the ORDER, not the event payload');
  assert.ok(src.includes('const payload = {') && src.includes('...order,'), 'and payload is built from the order');
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

test('a failed POST is thrown, so Medusa retries it', () => {
  /* This used to assert the opposite, and the reason it did has gone away.
   *
   * A subscriber that throws is retried by Medusa, and swallowing was right
   * while a retry could become a second order request. The import endpoint
   * deduplicates on `medusa:#{display_id}`, answers 200 to a repeat with
   * `duplicate: true`, and notifies the shop only on a genuine first delivery —
   * proven by a contract test against both backends, not assumed.
   *
   * So swallowing is now the worse option: it puts a failed import in a log and
   * nowhere else. Throwing means Medusa keeps trying until it lands.
   */
  const src = subscriberSource(URL);
  assert.ok(src.includes('try {') && src.includes('catch'), 'the POST is still guarded');
  assert.ok(/logger\.error/.test(src), 'and the failure is still reported before it propagates');
  assert.ok(/throw new Error\(/.test(src), 'a non-2xx throws');
  assert.ok(/throw e/.test(src), 'and an unreachable endpoint rethrows rather than being swallowed');
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

test('a fallback the mapper relies on is actually requested', () => {
  // The 2026-08-27 audit's finding here, and it is the quiet kind: the cloud
  // mapper reads `custom_display_id` when `display_id` is empty, and reads
  // `it.detail.quantity` when a line item carries no quantity of its own.
  // Neither was in the field list, so neither could ever arrive — the fallbacks
  // read as handled cases and were dead code. A ref fell through to the raw
  // internal id instead of the number the shop and the buyer both say aloud.
  const src = subscriberSource(URL);
  for (const f of ['custom_display_id', 'items.detail.*']) {
    assert.ok(FIELDS.includes(f), `${f} in FIELDS`);
    assert.ok(src.includes(`"${f}"`), `${f} requested in the generated query`);
  }

  // `items.*` does NOT expand a nested relation — Medusa's own shipped
  // subscriber lists `items.product.is_giftcard` explicitly alongside `items.*`
  // for that exact reason — so `items.detail.*` has to stand on its own line
  // and is not implied by the wildcard above it.
  assert.ok(FIELDS.includes('items.*'), 'the wildcard is still there');
  assert.notEqual(FIELDS.indexOf('items.detail.*'), FIELDS.indexOf('items.*'));
});

test('the generated file imports its types the way Medusa itself does', () => {
  // Medusa's own subscribers use `import type { SubscriberArgs, SubscriberConfig }`.
  // Khayt imported SubscriberArgs as a VALUE, which compiles under the default
  // starter tsconfig (it sets neither verbatimModuleSyntax nor isolatedModules)
  // and stops compiling the moment a shop turns either on. This is a file Khayt
  // hands someone to paste into a repository it will never see, so matching the
  // vendor's own form costs nothing and removes a break Khayt could not observe.
  const src = subscriberSource(URL);
  assert.match(src, /import type \{ SubscriberArgs, SubscriberConfig \} from "@medusajs\/framework"/);
  assert.ok(!/import \{ SubscriberArgs/.test(src), 'a type is never imported as a value');
});

test('the event and its payload are the ones Medusa emits', () => {
  // Verified against Medusa's own source, not inferred: OrderWorkflowEvents
  // declares `PLACED: "order.placed"` with an @eventPayload of `{ id }`. If
  // either changed, this subscriber would sit in a shop's repo firing never,
  // and nothing on either side would say so.
  const src = subscriberSource(URL);
  assert.match(src, /event: "order\.placed"/);
  assert.match(src, /SubscriberArgs<\{ id: string \}>/);
  assert.match(src, /filters: \{ id: data\.id \}/, 'the id from the event is what is fetched');
});

test('material is fetched from the product, because the line does not carry it', () => {
  /* `material` is a native PRODUCT column. The line-item DTO denormalises some
   * product columns — product_title, product_description, product_subtitle —
   * but not that one, so a subscriber asking only for `items.*` sends nothing
   * for it, for ever, silently. Khayt's importer reads `items[].metadata`, so
   * the subscriber has to fetch the product's column and fold it onto the line.
   *
   * Found by the integrator running the first real Medusa storefront, against a
   * freshly migrated database rather than the DTO's types — which cannot tell
   * you what the module graph can traverse.
   */
  const src = subscriberSource(URL);
  assert.ok(FIELDS.includes('items.product.material'),
    '`items.*` does not bring material — the relation has to be named');
  assert.match(src, /material: line\.metadata\?\.material \?\? product\?\.material/,
    'folded onto the line, with the line winning so a commission can override the catalogue');
  assert.match(src, /\(\{ product, \.\.\.line \}/,
    'and the product object is dropped — fetched for one string, not for its shape');
});

test('the admin link is optional and never invented', () => {
  // Khayt cannot derive it: the admin lives wherever the shop hosts it. Absent
  // env var means no admin_url key at all, rather than a broken link.
  const src = subscriberSource(URL);
  assert.match(src, /const MEDUSA_ADMIN_URL = process\.env\.MEDUSA_ADMIN_URL/);
  assert.match(src, /MEDUSA_ADMIN_URL \? \{ admin_url:/, 'only added when it is set');
});
