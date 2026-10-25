# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) working on `@fmarinoa/error-catalog`: a typed HTTP error catalog with an Express adapter. Open source, MIT.

Before changing code, read [ARCHITECTURE.md](ARCHITECTURE.md): code map, public API, invariants and decisions already taken (don't reopen them without a new reason).

## Commands

Node 24, pnpm. Run from the package folder; inside a workspace, `pnpm --filter @fmarinoa/error-catalog <script>` does the same.

```sh
pnpm test          # node:test over test/**/*.test.ts, with tsx
pnpm typecheck     # tsc --noEmit over src and test
pnpm build         # dist/ with .js + .d.ts; only to publish, delete it after checking
pnpm format        # prettier --write .

# one file / one test
node --import tsx --test test/core/issues.test.ts
node --import tsx --test --test-name-pattern="fromIssues" test/core/issues.test.ts

# what npm would publish; prepack builds dist/ first
pnpm pack --dry-run
```

## Structure rules

- **`src/core/`: one responsibility per file, no runtime dependencies** (Node built-ins only). New core behavior goes in the file that owns it; a new file only for a new responsibility.
- **`src/adapters/`: one file per framework.** An adapter imports from `../core/`; the core never imports an adapter. The framework is an optional `peerDependency` (plus a pinned `devDependency` for tests), imported with `import type` only.
- **`src/index.ts` only re-exports.** Whatever it doesn't re-export is internal and can change freely.
- **A new public entry** (an adapter) is a new subpath in both `exports` (to `./src/...ts`) and `publishConfig.exports` (to `./dist/...` with `types` and `default`).
- **Imports:** relative with a `.js` extension (resolves in tsx, Bundler and NodeNext); types with `import type` or `type` specifiers.
- **No unrequested abstractions:** no interfaces with one implementation, no factories, no options for a value nobody changes.

## Code style

- Comments are short `//` lines that say why, not what.
- JSDoc only on the public API (everything exported from an entry), with `@param`, `@returns`, `@throws` when it throws, and `@example` blocks. Every example must compile and run as written: check it with a throwaway file under `test/`, then delete it.
- Prettier formats everything (`node:` imports, then packages, then relative, separated).
- Code, comments and docs in English.

## Tests

- `test/` mirrors `src/`: `src/core/issues.ts` is tested in `test/core/issues.test.ts`. `test/catalog.ts` is the shared catalog for core tests.
- Test public behavior through the entries (`../../src/index.js`, `../../src/adapters/<name>.js`), not internal helpers.
- Names describe behavior (`"a 5xx logs its own stack unless detail is an Error"`), never ticket or spec ids. `describe` groups by domain (`"body and log"`, `"issues"`).
- Type guarantees are tests too: `// @ts-expect-error <why>` on what must not compile, checked by `pnpm typecheck`.
- Adapters are tested against the real framework on a real port (`app.listen(0)`), not mocks.
- Every behavior with a branch or an error path gets a test. Not tested: what TypeScript already proves, or a constant.

## Changes

- **Behavior or public API change:** update the code, its tests, the JSDoc, [README.md](README.md) and the invariants or decisions in [ARCHITECTURE.md](ARCHITECTURE.md), in the same change.
- **Body and log format are a contract** for every app using the package: `toJSON()`, `toString()`, the `fromIssues` format and `errors.schema`. Change them only on purpose, as a breaking change.
- **Versioning:** semver. Before 1.0, a breaking change bumps the minor (`0.1.0` to `0.2.0`); after 1.0, the major.
- **Before finishing:** `pnpm test` and `pnpm typecheck` green. If `exports`, `files` or the build changed: `pnpm pack --dry-run`, then delete `dist/`.
- **Publishing:** bump `version` with `npm version <patch|minor|major> --no-git-tag-version` in a PR to `main`. On merge, `.github/workflows/publish.yml` sees a version not yet on npm, runs the CI checks, `pnpm publish --access public` with npm trusted publishing (`prepack` builds `dist/`) tags `v<version>` and creates its GitHub Release with generated notes. Never `npm publish`: only pnpm swaps `exports` for `publishConfig.exports`, so npm would ship `exports` pointing to `src/*.ts`, which are not in the tarball.
- **Repository rules:** `.github/rulesets/*.json` are the GitHub rulesets (see [ARCHITECTURE.md](ARCHITECTURE.md)). Edit the JSON and apply it in the same change: `gh api -X PUT repos/fmarinoa/error-catalog/rulesets/<id> --input .github/rulesets/<name>.json` (ids from `gh api repos/fmarinoa/error-catalog/rulesets`). If a publish succeeds but its tag push fails, set the `tags` ruleset to `disabled`, push the tag, then back to `active`; if only the release failed, `gh release create v<version> --verify-tag --generate-notes`.
