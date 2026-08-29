/**
 * A field the server sends and the client throws away is invisible from both ends.
 *
 * `/v1/login` has always returned `verified`. lib/cloud-client.js's login()
 * rebuilt the response by hand and did not name it, so settings.js's
 * `verified: !!lr.verified` recorded every account as UNVERIFIED and the cloud
 * panel showed "⚠ Email not verified" to shops that verified months ago.
 * Chasing that warning leads to the Verify button, which asks the server, is
 * told alreadyVerified, and silently corrects the flag — so it looked like it
 * fixed itself, and came back on the next device.
 *
 * From the server's side the field was on the wire. From the renderer's side it
 * was undefined. Nothing in between logged anything, and no test looked at both
 * halves at once — which is what this does.
 *
 * Scope is the hand-parsed auth responses. The rest of the client returns
 * `r.body` or spreads it, so it cannot drop a field by omission.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cloud-client.js'), 'utf8');
const PHP = path.join(__dirname, '..', 'khayt-cloud', 'index.php');

/** The keys in the server's `send(200, [...])` for one endpoint. */
function serverFields(uri) {
  const src = fs.readFileSync(PHP, 'utf8');
  const at = src.indexOf(`$uri === '${uri}'`);
  assert.notEqual(at, -1, `${uri} is not routed in index.php any more — update this test`);
  const block = src.slice(at, src.indexOf("\n    }", at));
  const send = block.match(/send\(200,\s*\[([\s\S]*?)\]\);/);
  assert.ok(send, `${uri} no longer answers with a send(200, [...]) literal`);
  return [...send[1].matchAll(/'([A-Za-z_]\w*)'\s*=>/g)].map((m) => m[1]);
}

/** The keys the client's parser puts on its resolved object. */
function clientFields(fn) {
  const at = CLIENT.indexOf(`async function ${fn}(`);
  assert.notEqual(at, -1, `cloud-client.js no longer defines ${fn}`);
  const body = CLIENT.slice(at, CLIENT.indexOf('\n}', at));
  const ret = body.match(/return\s*\{([\s\S]*?)\n?\s*\}\s*;/);
  assert.ok(ret, `${fn} no longer returns an object literal`);
  return [...ret[1].matchAll(/(?:^|[,{\s])([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]);
}

for (const [uri, fn] of [['/v1/login', 'login'], ['/v1/signup', 'signup'], ['/v1/accept-invite', 'acceptInvite']]) {
  test(`${uri}: the client carries every field the server sends`, () => {
    const sent = serverFields(uri);
    const kept = clientFields(fn);
    const dropped = sent.filter((f) => !kept.includes(f));
    assert.deepEqual(dropped, [],
      `${fn}() drops ${dropped.join(', ')} — the server sends it and the renderer will read undefined.\n` +
      `  server sends: ${sent.join(', ')}\n  client keeps: ${kept.join(', ')}`);
  });
}

test('login specifically carries verified, and absent does not mean verified', () => {
  const kept = clientFields('login');
  assert.ok(kept.includes('verified'), 'login() must carry verified — the unverified banner is driven by it');
  const at = CLIENT.indexOf('async function login(');
  const body = CLIENT.slice(at, CLIENT.indexOf('\n}', at));
  // `|| false` would be fine; `!== false` or a bare truthy default would make an
  // older server that omits the field read as verified, which is the unsafe way
  // to be wrong: it hides the banner AND the button that fixes it.
  assert.match(body, /verified:\s*r\.body\.verified\s*===\s*true/,
    'an absent verified must resolve to false, not to a silent claim of verified');
});
