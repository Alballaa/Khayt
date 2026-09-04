#!/usr/bin/env node
/**
 * Every end-to-end smoke, in one command.
 *
 * There are forty-five of them and CI runs all forty-five. Locally it is far
 * too easy to run `test:e2e` and `test:e2e:bedready`, see two greens, and push
 * — which is exactly how a change that moved order creation into a shared
 * module reached CI with `NewOrderRules is not defined`, caught by
 * `test:e2e:qc` and by nothing else I had run.
 *
 * The list is READ FROM package.json rather than written down here, so it
 * cannot drift from the scripts that exist. `--only <substring>` runs the
 * matching ones when you know which area you touched.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const only = (() => {
  const i = process.argv.indexOf('--only');
  return i === -1 ? null : process.argv[i + 1];
})();

const suites = Object.keys(pkg.scripts)
  .filter((s) => s === 'test:e2e' || s.startsWith('test:e2e:'))
  // `test:e2e:all` is this file; running it from itself would not end.
  .filter((s) => s !== 'test:e2e:all')
  .filter((s) => !only || s.includes(only))
  .sort();

if (suites.length === 0) {
  process.stderr.write(only ? `no e2e suite matches "${only}"\n` : 'no e2e suites found\n');
  process.exit(1);
}

process.stdout.write(`running ${suites.length} e2e suite(s)\n\n`);
const failed = [];
const started = Date.now();

for (const suite of suites) {
  const at = Date.now();
  const run = spawnSync('npm', ['run', '--silent', suite], { cwd: root, encoding: 'utf8' });
  const secs = ((Date.now() - at) / 1000).toFixed(1);
  const ok = run.status === 0;
  if (!ok) failed.push({ suite, output: `${run.stdout || ''}${run.stderr || ''}` });
  process.stdout.write(`${ok ? '  ok  ' : '  FAIL'} ${suite.padEnd(28)} ${secs}s\n`);
}

const total = ((Date.now() - started) / 1000).toFixed(0);
if (failed.length === 0) {
  process.stdout.write(`\nall ${suites.length} e2e suites passed in ${total}s\n`);
  process.exit(0);
}

// The whole output of each failure, at the end, so a run left in a scrollback
// still says what broke.
for (const f of failed) {
  process.stderr.write(`\n${'='.repeat(70)}\n${f.suite}\n${'='.repeat(70)}\n`);
  process.stderr.write(f.output.split('\n').slice(-40).join('\n') + '\n');
}
process.stderr.write(`\n${failed.length} of ${suites.length} e2e suites failed: ${failed.map((f) => f.suite).join(', ')}\n`);
process.exit(1);
