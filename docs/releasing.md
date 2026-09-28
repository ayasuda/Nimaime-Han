# Releasing

`nimaime-han` is published to npm from GitHub Actions with
[Changesets](https://changesets.dev). Nobody runs `npm publish` by hand.

- Every user-facing pull request adds a **changeset**: a small Markdown file in `.changeset/` that
  names the bump type and describes the change for the changelog.
- On `main`, the [Release workflow](../.github/workflows/release.yml) collects the changesets into
  a **"Version Packages" pull request** that bumps the version and updates
  [CHANGELOG.md](../CHANGELOG.md).
- Merging that pull request **publishes** the new version to npm with provenance, pushes the
  `vX.Y.Z` git tag and creates a GitHub release.

## Versioning policy

Nimaime-Han is experimental (see _Status_ in the [README](../README.md#status)): the Sanmaime
syntax and the APIs are not stable yet. Until 1.0 the version stays at **0.x**, and the bump types
are shifted down by one:

| Change                                                                                                       | Bump                        | Example         |
| ------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------- |
| Breaking: Sanmaime syntax or semantics, a public export, a CLI flag or exit code, generated code, config key | `minor`                     | `0.3.4 → 0.4.0` |
| New feature (backwards compatible)                                                                           | `patch`                     | `0.3.4 → 0.3.5` |
| Bug fix                                                                                                      | `patch`                     | `0.3.4 → 0.3.5` |
| No change for users (tests, CI, repository docs, examples, the editor grammar)                               | no changeset (or `--empty`) | —               |

Changesets itself does not know about this convention: when you run `npm run changeset`, choose
**minor** for a breaking change and **patch** for everything else. **Never choose `major`** before
1.0 — that would publish 1.0.0. Going to 1.0 is a deliberate decision, made in its own pull
request.

Users should therefore depend on `nimaime-han` with a tilde range (`~0.4.0`) or an exact version;
npm's default caret range for 0.x (`^0.4.0`) already stops at the next minor, so it is also safe.

The public surface that counts as "breaking" is: the Sanmaime language ([sanmaime.md](./sanmaime.md),
[i18n.md](./i18n.md)), the exports of `nimaime-han`, `nimaime-han/parser`, `nimaime-han/runtime`
and `nimaime-han/reporter` ([api.md](./api.md)), the `nimaime-gen` and `nimaime` CLIs
([cli.md](./cli.md)), the configuration
([config.md](./config.md)), the shape of generated spec files and the reporter output format.

## Writing a changeset

```bash
npm run changeset
```

The prompt asks for the bump type and a summary, and writes `.changeset/<random-name>.md`:

```md
---
'nimaime-han': patch
---

`nimaime-gen check` now exits with code 1 when a spec file has a parse error.
```

- Write the summary for users of the package: what changed and what they have to do. It is copied
  verbatim into CHANGELOG.md and the GitHub release.
- One pull request can carry several changesets, one per independent change.
- Edit or delete the file like any other file in the pull request.
- For a pull request with nothing to release, either add no changeset or run
  `npm run changeset -- --empty`.

## How a release happens

1. Pull requests with changesets are merged into `main`.
2. The Release workflow runs on the push to `main`: it installs with `npm ci`, runs lint, format
   check, typecheck, unit tests, build and `npm pack --dry-run`, then runs
   [`changesets/action`](https://github.com/changesets/action). Because changesets are present, the
   action runs `npm run version` on a `changeset-release/main` branch and opens (or updates) the
   **Version Packages** pull request. `npm run version` is:
   - `changeset version` — bumps `version` in package.json, prepends the entries to CHANGELOG.md
     (formatted with Prettier) and deletes the consumed changesets;
   - `node .changeset/sync-version.js` — copies the new version to `src/version.ts` (the `VERSION`
     export and `nimaime-gen --version`, checked by `test/version.test.ts`) and to the root entries
     of package-lock.json.
3. A maintainer reviews the Version Packages pull request (version number, CHANGELOG wording) and
   merges it.
4. The Release workflow runs again. There are no changesets left, so the action runs
   `npm run release` = `npm run build && changeset publish`. `changeset publish` runs
   `npm publish` for every version not yet on the registry (the package's `prepublishOnly` script
   repeats lint, typecheck, unit tests and build as a last guard), with provenance
   (`publishConfig.provenance` and `NPM_CONFIG_PROVENANCE=true`) and public access. The action
   then pushes the `vX.Y.Z` tag and creates the GitHub release from the CHANGELOG entry.

End-to-end tests (`test:e2e`, `test:e2e:gen`) and the example projects are not run in the Release
workflow; CI runs them on every push to `main` and every pull request, so the commit being released
has already passed them.

Do not run `npm version`: npm would run the `version` script (`changeset version`) as a lifecycle
hook and also create its own commit and tag. Versions only change through changesets.

## Repository setup (one time)

The repository owner configures:

| Where                                                        | What                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub → Settings → General → Default branch                 | A **`main`** branch as the default branch. The Release workflow runs on pushes to `main` and `.changeset/config.json` compares against `main` (`baseBranch`). On 2026-09-28 the default branch was still `claude/nimaime-han-init-ivlii6`. |
| npmjs.com                                                    | An account that owns (or can create) the `nimaime-han` package, with 2FA enabled. On 2026-09-28 `npm view nimaime-han` returned 404, i.e. the name was still free; the first publish claims it.                                            |
| npmjs.com → Access Tokens                                    | A **granular access token** with read and write access to `nimaime-han` (for the first publish, to all packages, since the package does not exist yet) that may bypass 2FA for automation.                                                 |
| GitHub → Settings → Secrets and variables → Actions          | Repository secret **`NPM_TOKEN`** holding that token. The workflow passes it to npm as `NODE_AUTH_TOKEN`.                                                                                                                                  |
| GitHub → Settings → Actions → General → Workflow permissions | Enable **"Allow GitHub Actions to create and approve pull requests"** (needed for the Version Packages pull request). The workflow asks for `contents: write`, `pull-requests: write` and `id-token: write` itself.                        |
| GitHub → Settings → Branches / Rulesets (optional)           | If `main` is protected, allow the release job to push tags `v*`; the version bump itself goes through the pull request.                                                                                                                    |

`id-token: write` is what lets npm attach a **provenance** statement (a signed link from the
published tarball to this repository, workflow and commit). Provenance requires a public
repository and publishing from GitHub-hosted runners; `publishConfig.provenance: true` also means
a manual `npm publish` from a laptop fails, which is intended.

Optional: after the first publish, configure npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) for `nimaime-han` (npmjs.com →
package settings → Trusted publisher: GitHub Actions, repository `ayasuda/Nimaime-Han`, workflow
`release.yml`). npm then authenticates the workflow through OIDC (`id-token: write`) and the
`NPM_TOKEN` secret can be deleted. Trusted publishing needs npm 11.5.1 or later; Node 22 ships with
npm 10, so add a step `npm install -g npm@latest` before the publish step when switching.

Pull requests opened with the default `GITHUB_TOKEN` do not trigger other workflows, so CI does not
run on the Version Packages pull request by itself. It only changes package.json,
package-lock.json, src/version.ts, CHANGELOG.md and deletes changesets, and the Release workflow
re-runs the checks before publishing. To get CI on it anyway, close and reopen the pull request, or
pass a GitHub App / fine-grained token to the action's `github-token` input.

## Checking the package locally

The package ships only `dist/`, `README.md`, `LICENSE` and `package.json` (`files` in
package.json). Before changing `files`, `exports`, `bin` or the build, check the tarball:

```bash
npm run build
npm pack --dry-run          # lists the files that would be published
```

To check that the exports and the bins work from an installed copy (the same check was run for this
setup), install the packed tarball into a scratch project:

```bash
npm run build
PKG_DIR="$PWD"
SMOKE="$(mktemp -d)"
npm pack --pack-destination "$SMOKE"
cd "$SMOKE"
npm init -y > /dev/null
npm install ./nimaime-han-*.tgz @playwright/test

cat > smoke.mjs <<'JS'
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ids = ['nimaime-han', 'nimaime-han/parser', 'nimaime-han/runtime', 'nimaime-han/reporter'];
for (const id of ids) {
  const esm = await import(id);
  const cjs = require(id);
  console.log(id, '| import:', Object.keys(esm).length, 'exports | require:', Object.keys(cjs).length, 'exports');
}
const pkg = require('nimaime-han/package.json');
const pkgJson = await import('nimaime-han/package.json', { with: { type: 'json' } });
console.log('package.json', pkg.version, pkgJson.default.version);
JS
node smoke.mjs

npx nimaime-gen --version   # prints the version from package.json
ls -l node_modules/.bin/     # every entry of `bin` is linked
tar tvzf nimaime-han-*.tgz | grep dist/cli/   # CLI entry files are executable (-rwxr-xr-x)
cd "$PKG_DIR"
```

Every subpath must load through both `import` and `require`, and every `bin` entry must be
executable in the tarball (tsup keeps the `#!/usr/bin/env node` line and marks the file
executable). The type declarations can be checked the same way with a `.mts` and a `.cts` file
that import each subpath, compiled with `tsc --module nodenext --moduleResolution nodenext`.

To preview what the next release would contain without publishing anything:

```bash
npx changeset status --verbose   # needs a local `main` branch to compare against
```

---

See also: [CONTRIBUTING.md](../CONTRIBUTING.md) · [CHANGELOG.md](../CHANGELOG.md) ·
[contributing-tests.md](./contributing-tests.md) · [documentation index](./README.md)
