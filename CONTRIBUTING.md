# Contributing

Thanks for helping with `@fmarinoa/error-catalog`. Bugs and ideas go to [issues](https://github.com/fmarinoa/error-catalog/issues); for a bug, include a minimal catalog and the call that misbehaves.

## Setup

Node 24 and pnpm (the version in `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm test          # node:test with tsx, no build needed
pnpm typecheck
pnpm format        # prettier --write .
```

## Rules

[AGENTS.md](AGENTS.md) is the rulebook for people and agents alike: structure, code style, tests and what a change must update. [ARCHITECTURE.md](ARCHITECTURE.md) has the code map, invariants and decisions already taken; reopen one only with a new reason.

The short version:

- Zero runtime dependencies in `src/core/`.
- A behavior change comes with its tests, JSDoc, README and ARCHITECTURE updates in the same PR.
- The JSON body, the log line, the `fromIssues` format and `errors.schema` are a contract: change them only as a deliberate breaking change.

## Pull requests

`main` only changes through a PR. Before opening one, run what CI runs:

```sh
pnpm format:check && pnpm typecheck && pnpm test && pnpm pack --dry-run
```

`pnpm pack --dry-run` builds `dist/`; delete it afterwards. Don't bump `version` in a contribution: releases are the maintainer's.

## Releases (maintainer)

1. In a PR to `main`: `npm version <patch|minor|major> --no-git-tag-version`.
2. Merge it. `publish.yml` sees a version npm doesn't have, reruns CI, publishes with npm trusted publishing, tags `v<version>` and creates its GitHub Release.

Tags can't be pushed by hand: a ruleset reserves them for the workflow (see `.github/rulesets/`). Always publish through pnpm, never `npm publish`; [AGENTS.md](AGENTS.md) explains why.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
