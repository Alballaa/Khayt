/**
 * A workflow file that does not parse is a zero-second red build.
 *
 * GitHub does not tell you it is a syntax error — the run appears, fails in 0s
 * with no job output, and `gh pr checks` reports "no checks reported on the
 * branch", which reads like CI has not started yet rather than like a mistake.
 *
 * The specific trap, hit while adding the keyboard e2e step:
 *
 *     - name: E2E smoke (keyboard: modal focus, trap, Escape)
 *
 * An unquoted `: ` inside a YAML scalar starts a mapping, so the step — and the
 * whole file — fails to parse. Quoting the value fixes it.
 *
 * Deliberately NOT a real YAML parse: js-yaml is not a declared devDependency
 * here (it is only transitively present), and a guard that depends on a package
 * nobody installed on purpose is the kind that breaks on a clean `npm ci` for
 * reasons unrelated to what it checks. This tests the one hazard that has
 * actually bitten, with no dependencies at all.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '.github', 'workflows');

function workflows() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

/** `key: value` lines whose value holds an unquoted `: `. */
function unquotedColonScalars(src) {
  const bad = [];
  src.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*-?\s*(name|title|description):\s+(.*)$/);
    if (!m) return;
    const value = m[2].trim();
    if (!value || value.startsWith('"') || value.startsWith("'") || value.startsWith('|') || value.startsWith('>')) return;
    if (/:\s/.test(value)) bad.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
  });
  return bad;
}

test('the check can see the workflow files', () => {
  // Guards the guard: an empty list would make every assertion below vacuous.
  const files = workflows();
  assert.ok(files.length >= 2, `expected several workflows, found ${files.length}`);
});

test('no workflow scalar contains an unquoted colon', () => {
  const offenders = [];
  for (const f of workflows()) {
    for (const hit of unquotedColonScalars(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      offenders.push(`${f}:${hit}`);
    }
  }
  assert.deepEqual(offenders, [],
    `quote these values — an unquoted ": " starts a mapping and the file stops parsing:\n  ${offenders.join('\n  ')}`);
});

test('the rule recognises the shapes it is meant to', () => {
  assert.equal(unquotedColonScalars('      - name: E2E smoke (keyboard: focus)').length, 1, 'unquoted colon is caught');
  assert.equal(unquotedColonScalars('      - name: "E2E smoke (keyboard: focus)"').length, 0, 'quoting fixes it');
  assert.equal(unquotedColonScalars("      - name: 'a: b'").length, 0, 'single quotes too');
  assert.equal(unquotedColonScalars('      - name: Plain step name').length, 0, 'ordinary names pass');
  assert.equal(unquotedColonScalars('        run: xvfb-run -a npm run x').length, 0, 'run: is not a scalar we police');
  assert.equal(unquotedColonScalars('      - name: Ratio 16:9 kept').length, 0,
    'a colon with no following space is not a mapping and must not be flagged');
});

test('every workflow declares a name and at least one job', () => {
  // A cheap structural sanity check that needs no YAML parser: both keys are
  // required, and their absence usually means a botched edit.
  for (const f of workflows()) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.match(src, /^name:\s*\S/m, `${f} has no top-level name`);
    assert.match(src, /^jobs:\s*$/m, `${f} declares no jobs`);
  }
});
