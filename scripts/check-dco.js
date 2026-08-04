#!/usr/bin/env node
/**
 * Every commit must carry the DCO sign-off CONTRIBUTING.md already requires.
 *
 * CONTRIBUTING.md says "PRs without a sign-off can't be merged". That was not
 * true: no check enforced it, so an unsigned PR merged exactly like a signed
 * one. A rule documented but unenforced is worse than no rule — it reads as a
 * gate to contributors who follow it and is invisible to everyone else, and the
 * sign-off is what carries a contribution into both the FSL and the commercial
 * license (see CLA.md). This makes the sentence true.
 *
 * What it asks for is exactly what `git commit -s` produces:
 *
 *   Signed-off-by: Your Name <you@example.com>
 *
 * The email must match the commit's author email, because the DCO is the AUTHOR
 * certifying their own work — a sign-off in someone else's name certifies
 * nothing. That is also the most common way this fails: committing from the
 * GitHub web UI authors as `…@users.noreply.github.com` while `git config` at
 * home says something else, so the trailer and the author disagree.
 *
 * Merge commits are exempt, and that exemption is load-bearing rather than
 * lazy: `main` requires branches to be up to date, so every PR that goes stale
 * gets an "Update branch" merge commit created by GitHub, which no human wrote
 * and nobody can sign. Demanding a sign-off there would fail PRs for the act of
 * keeping them current.
 */
'use strict';

const TRAILER = /^\s*Signed-off-by:\s*(.+?)\s*<([^>]+)>\s*$/i;

/** `Turki <a@b.c>` -> `a@b.c`, lowercased. Anything unparseable -> ''. */
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * @param {{sha: string, author: string, email: string, body: string}[]} commits
 * @returns {{ok: boolean, reason: string, unsigned: object[]}}
 */
function verdict(commits) {
  const list = Array.isArray(commits) ? commits : [];
  if (!list.length) {
    // Nothing to certify. An empty range is a CI wiring question, not a
    // contributor error, so it must not fail the PR.
    return { ok: true, reason: 'no commits to check', unsigned: [] };
  }

  const unsigned = [];
  for (const c of list) {
    const author = normalizeEmail(c.email);
    const signoffs = String(c.body || '')
      .split('\n')
      .map((line) => TRAILER.exec(line))
      .filter(Boolean)
      .map((m) => ({ name: m[1], email: normalizeEmail(m[2]) }));

    if (!signoffs.length) {
      unsigned.push({ ...c, why: 'no Signed-off-by line' });
      continue;
    }
    if (!signoffs.some((s) => s.email === author)) {
      unsigned.push({
        ...c,
        why: `signed off by ${signoffs.map((s) => s.email).join(', ')}, but authored by ${author}`,
      });
    }
  }

  if (unsigned.length) {
    return {
      ok: false,
      reason: `${unsigned.length} of ${list.length} commit(s) are not signed off`,
      unsigned,
    };
  }
  return { ok: true, reason: `${list.length} commit(s) signed off`, unsigned: [] };
}

module.exports = { verdict, normalizeEmail, TRAILER };

if (require.main === module) {
  const { execFileSync } = require('child_process');
  const base = process.env.BASE_REF || process.argv[2] || 'main';
  // Field/record separators. These are git's OWN escapes: git writes 0x1f/0x1e
  // into its output, while argv carries only the literal text "%x1f". Passing a
  // real NUL here instead throws ERR_INVALID_ARG_VALUE — which the catch below
  // used to report as "skipped, exit 0", i.e. a guard that passed everything.
  const FIELD = '\x1f';
  const RECORD = '\x1e';

  // A base ref that does not exist is a CI wiring fault, not a contributor's,
  // and failing the PR for it would teach people to ignore this check. Anything
  // ELSE going wrong is this script's bug and must fail loudly: a DCO gate that
  // exits 0 when it is broken is worse than no gate, because it reports green.
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { stdio: 'ignore' });
  } catch {
    process.stdout.write(`DCO check skipped — base ref "${base}" not found in this checkout\n`);
    process.exit(0);
  }

  // --no-merges: see the header. %H sha, %an name, %ae author email, %B body.
  const raw = execFileSync(
    'git',
    ['log', '--no-merges', '--format=%H%x1f%an%x1f%ae%x1f%B%x1e', `${base}..HEAD`],
    { encoding: 'utf8' },
  );
  const commits = raw
    .split(RECORD)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, author, email, ...rest] = chunk.split(FIELD);
      return { sha: (sha || '').trim(), author, email, body: rest.join(FIELD) };
    });

  const r = verdict(commits);
  if (r.ok) {
    process.stdout.write(`DCO check ok — ${r.reason}\n`);
    process.exit(0);
  }

  process.stderr.write(
    `\nDCO check failed — ${r.reason}.\n\n` +
    r.unsigned.slice(0, 20).map((c) => `  ${c.sha.slice(0, 8)}  ${c.why}\n`).join('') +
    (r.unsigned.length > 20 ? `  …and ${r.unsigned.length - 20} more\n` : '') +
    `\nSign off by amending or rebasing so every commit ends with a line matching\n` +
    `its own author email:\n\n` +
    `  Signed-off-by: Your Name <you@example.com>\n\n` +
    `  git commit -s            # on the next commit\n` +
    `  git commit -s --amend    # to fix the most recent one\n` +
    `  git rebase --signoff ${base}   # to fix every commit on this branch\n\n` +
    `This certifies you wrote the change and agree to the CLA (CLA.md), which is\n` +
    `what lets it be carried under both licenses. See CONTRIBUTING.md.\n`
  );
  process.exit(1);
}
