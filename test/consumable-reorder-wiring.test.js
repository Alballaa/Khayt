/**
 * Consumable reordering, as wired in.
 *
 * lib/consumable-reorder.js decides what to suggest. What can only go wrong HERE
 * is the chain a suggestion travels afterwards — suggest → draft PO → receive →
 * restock → expense — and every link of it was built for filament:
 *
 *   1. Receipt looks the PO's itemId up in `inventory`. A consumable is not
 *      there, so it restocks nothing, marks itself received, and the goods are
 *      paid for and absent from stock. Nothing errors.
 *   2. Quantities are grams. The receive dialog is captioned "(g)" and the
 *      expense divides by 1000 because filament is priced per kilo. A count of
 *      boxes through that arithmetic is off by three orders of magnitude.
 *   3. The expense is categorised `filament`, which inflates the material spend
 *      that pricing and the per-kilo analytics are derived from.
 *
 * Comments are stripped before matching: an assertion that passes by finding the
 * prose explaining a rule, rather than the rule, is one this repo has shipped
 * before.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** Drop // and /* *\/ comments so a rule can't be matched by its own explanation. */
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const inv = decomment(read('renderer/inventory.js'));
const wire = decomment(read('renderer/wire-events.js'));
const html = read('renderer/index.html');

test('the module is loaded, or every call below is a ReferenceError', () => {
  assert.match(html, /<script src="\.\.\/lib\/consumable-reorder\.js"><\/script>/,
    'lib/consumable-reorder.js is never loaded');
});

// ───────────────────────────────────────────── the kind discriminator

test('a consumable PO is marked, and an unmarked one stays filament', () => {
  // Absent `kind` MUST read as filament: every PO written before this feature
  // has none, and the receive path restocks a different field on the answer.
  const at = inv.indexOf('function createPurchaseOrder(');
  const body = inv.slice(at, inv.indexOf('\n}', at));
  assert.match(body, /opts && opts\.kind === 'consumable'/,
    'the PO does not record which collection its itemId came from');
  assert.match(body, /kind: 'consumable'/);
  assert.doesNotMatch(body, /kind: opts\.kind\b/,
    'an arbitrary kind is written through, so an unknown value would route nowhere');
});

test('a consumable PO carries the item\'s name and unit, not a material', () => {
  const at = inv.indexOf('function createPurchaseOrder(');
  const body = inv.slice(at, inv.indexOf('\n}', at));
  assert.match(body, /isConsumable \? \(item\.name \|\| ''\) : item\.material/,
    'a consumable PO would be titled undefined — consumables have no .material');
  assert.match(body, /unit: \(item\.unit \|\| ''\)/, 'the unit is not carried, so receipt cannot label itself');
  assert.doesNotMatch(body, /item\.reorderQty \|\| 1000\b/,
    '1000 is a spool; it must not be the default quantity for a box of screws');
});

// ────────────────────────────────────────────────── receiving the goods

test('a received consumable restocks the consumable, not a spool', () => {
  // The whole feature is worthless — worse than absent — if the goods arrive and
  // stock does not move.
  const at = wire.indexOf("const recv    = e.target.closest('[data-act=\"po-receive\"]')");
  assert.ok(at > -1, 'the receive handler moved; this guard is anchored on it');
  const body = wire.slice(at, at + 4500);
  assert.match(body, /const isCons = po\.kind === 'consumable'/, 'receipt never asks what kind of order this is');
  assert.match(body, /consumables\.find\(x => x\.id === po\.itemId\)/,
    'a consumable PO is looked up in `inventory`, where it does not exist');
  assert.match(body, /cons\.stock = Math\.max\(0, \(\+cons\.stock \|\| 0\) \+ w\)/,
    'the consumable is found and then not restocked');
  // The spool path must survive untouched.
  assert.match(body, /invItem\.weight = Math\.min\(\(invItem\.weight \|\| 0\) \+ w, 99000\)/,
    'the filament restock was lost in the refactor');
});

test('the amount is asked for in the shop\'s unit, never captioned grams', () => {
  const at = wire.indexOf("const recv    = e.target.closest('[data-act=\"po-receive\"]')");
  const body = wire.slice(at, at + 4500);
  assert.match(body, /const unitLbl = isCons/, 'the unit label is not derived from the order');
  assert.doesNotMatch(body, /po\.weight_received'\)\}\s*\(g\)/,
    'the receive dialog is hard-captioned (g) — a count of boxes asked for in grams');
});

test('a consumable is not booked as filament spend', () => {
  // `filament` feeds the material cost that pricing and the per-kilo analytics
  // are built on. Glue in that number is a wrong number, not an untidy one.
  const at = wire.indexOf("const recv    = e.target.closest('[data-act=\"po-receive\"]')");
  const body = wire.slice(at, at + 4500);
  assert.match(body, /category: isCons \? 'other' : 'filament'/,
    'a box of bags is recorded as filament spend');
  assert.doesNotMatch(body, /isCons[\s\S]{0,200}\(w \* \(po\.unitCost \|\| 0\) \/ 1000\)/,
    'the per-kilo division is applied to a per-unit price');
  assert.match(body, /\+\(w \* \(\+po\.unitPrice \|\| \+po\.unitCost \|\| 0\)\)\.toFixed\(2\)/,
    'the consumable expense is not priced per unit');
});

test('completion is measured against what was actually ordered', () => {
  // po.weightOrdered is only ever set on filament orders. Left as the yardstick,
  // a consumable order can never reach `received` and stays partial forever.
  const at = wire.indexOf("const recv    = e.target.closest('[data-act=\"po-receive\"]')");
  const body = wire.slice(at, at + 4500);
  assert.match(body, /const ordered = isCons \? \(\+po\.qty \|\| 0\) : \(po\.weightOrdered \|\| 0\)/,
    'the ordered quantity is read from a filament-only field');
  assert.match(body, /if \(ordered > 0 && po\.receivedSoFar >= ordered\)/,
    'completion still compares against weightOrdered');
});

// ──────────────────────────────────────────────────── drafting the orders

test('consumables are deduped against consumable POs only', () => {
  // reorder.js's itemsNeedingDraftPo matches on itemId alone. Both id spaces
  // come from the same uid(), so sharing it would let an open consumable order
  // silence the reorder for an empty spool.
  assert.match(inv, /CR\.consumablesNeedingDraftPo\(csug, purchaseOrders\)/,
    'consumables are deduped with the filament matcher');
  const at = inv.indexOf('function maybeAutoDraftPurchaseOrders(');
  const body = inv.slice(at, inv.indexOf('\n}\n', at));
  assert.match(body, /KhaytConsumableReorder/, 'auto-draft never considers consumables');
  assert.match(body, /kind: 'consumable'/, 'the drafted PO is not marked as a consumable order');
});

test('the suggestion modal offers consumables and counts them in the button', () => {
  const at = inv.indexOf('function openReorderSuggestions(');
  const body = inv.slice(at, inv.indexOf('\n}\n', at));
  assert.match(body, /CR\.consumableSuggestions\(consumables, printLog/, 'the modal never asks for consumables');
  assert.match(body, /draftable\.length \+ cDraftable\.length/,
    'the draft button ignores consumables, so they are listed but cannot be ordered');
  assert.match(body, /consumableReorderText\(csug/, 'the copied list omits consumables');
});

test('a consumable quantity never renders under a grams heading', () => {
  const at = inv.indexOf('function openReorderSuggestions(');
  const body = inv.slice(at, inv.indexOf('\n}\n', at));
  // The consumable rows must go through qtyLabel, which appends the item's own
  // unit or nothing at all — never the ` g` the filament rows hard-code.
  const crows = body.slice(body.indexOf('const crows'), body.indexOf('const cDraftable'));
  assert.match(crows, /CR\.qtyLabel\(s\.stock, s\.unit\)/, 'stock is rendered without its unit');
  assert.doesNotMatch(crows, /\} g</, 'a consumable row hard-codes grams');
});

test('an empty filament list still shows the consumables that need ordering', () => {
  const at = inv.indexOf('function openReorderSuggestions(');
  const body = inv.slice(at, inv.indexOf('\n}\n', at));
  assert.match(body, /bodyHtml: \(sug\.length \|\| csug\.length\) \?/,
    'consumables are hidden whenever filament happens to be healthy');
});

test('the heading is translated everywhere', () => {
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const loc = read(`renderer/locales/${code}.js`);
    assert.ok(loc.includes('"reorder.consumables":'), `${code} is missing reorder.consumables`);
  }
});
