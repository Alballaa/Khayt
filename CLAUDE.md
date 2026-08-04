# CLAUDE.md

Notes for agents working in this repository. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the
human workflow (setup, sign-off, code areas); this file covers what the repo *enforces*, which
is the part that silently wastes a session if you don't know it.

## `main` is protected — and it is a ruleset, not classic branch protection

`gh api repos/KhaytApp/Khayt/branches/main/protection` returns **404 Branch not protected**.
That is not the answer: protection lives in a **repository ruleset** named `Protect main`
(id `16949689`, enforcement `active`, targeting `~DEFAULT_BRANCH`). Read the rules that
actually apply with:

```bash
gh api repos/KhaytApp/Khayt/rules/branches/main
```

Rules in force:

| Rule | Effect |
|---|---|
| `deletion` | `main` cannot be deleted |
| `non_fast_forward` | no force-push to `main` |
| `required_status_checks` (**strict**) | the required checks must pass **and** the branch must be up to date |

Required checks — all come from [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- `Changelog entry`
- `Syntax check`
- `E2E smoke (Electron)`
- `DCO sign-off`

`bypass_actors` is **empty**, so nobody is exempt. `gh pr merge --admin` is refused with
`Repository rule violations found` even for a repo admin — verified by attempting it, not
inferred from config. Rulesets have no "include administrators" toggle: exemption exists only
if a principal is explicitly listed, and none is.

### What this means in practice

- **Never `git checkout -b` from wherever HEAD happens to be.** Branch explicitly:
  ```bash
  git fetch origin main && git checkout -B <branch> origin/main
  ```
  Worktrees here sit on long-lived session branches that can be dozens of commits behind
  `main`. A PR opened from a stale base is `mergeStateStatus=BEHIND` and cannot merge under
  the strict rule, so the mistake surfaces only at merge time.
- **Direct pushes to `main` are effectively blocked** — required checks cannot have run on a
  commit that has not been pushed. Everything lands by PR. Release *tags* are unaffected, so
  the `vX.Y.Z` tagging flow in [VERSIONING.md](./VERSIONING.md) still works.
- **`gh pr merge --auto` is the right tool** — it waits for green and re-queues after the
  branch is updated. Before the strict rule existed it merged immediately, which is not what
  the flag looks like it does.
- **When `main` moves under an open PR**, update the branch (`git merge origin/main`) and let
  CI rerun; the merge is refused until it is current.

### Deliberately *not* required: `iOS contract`

`.github/workflows/ios-contract.yml` is path-filtered to `ios/**`, `lib/lan-server.js` and
`scripts/ios-contract-*`. On a PR touching none of those the workflow never runs, so the check
never reports — and a required check that never reports blocks the PR forever. Leave it out
unless the filters are removed. The required checks all live in `ci.yml`, which has no path
filters and therefore always reports.

## Sign-off is enforced — commit with `-s`

Every non-merge commit in a PR must carry a `Signed-off-by` trailer whose email matches its own
author, or `DCO sign-off` fails. Use `git commit -s`; to fix a branch after the fact,
`git rebase --signoff origin/main`.

The email has to be the **author's**, because the DCO is the author certifying their own work.
The usual real-world failure is a commit made in the GitHub web UI, which authors as
`…@users.noreply.github.com` while local `git config` says something else — the guard prints
both addresses when they disagree, rather than just refusing.

Merge commits are exempt on purpose: `main` is strict, so a stale PR gets an "Update branch"
merge commit written by GitHub that nobody can sign. See [`scripts/check-dco.js`](scripts/check-dco.js).
