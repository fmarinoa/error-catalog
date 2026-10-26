# Architecture

`@fmarinoa/error-catalog` turns a catalog of HTTP errors into typed classes. Each error knows its status, an optional business code and a default message; it answers clients with a fixed body (`{ code?, message }`, or RFC 9457 problem details on request), logs itself as one line of JSON, and has JSON Schemas and OpenAPI components for its bodies. Express, Fastify and Hono adapters answer them.

This file is the source of truth for structure, invariants and decisions. How to work on the package lives in [AGENTS.md](AGENTS.md); how to use it, in [README.md](README.md).

## Bird's eye view

```
            your code
   throw new NotFoundError(...)          app.use(errorHandler({ fallback, log }))
                 │                                      │
                 ▼                                      ▼
   src/index.ts (public: "." )       src/adapters/{express,fastify,hono}.ts
                 │          (public: "./express", "./fastify", "./hono")
                 ▼                                      │
   src/core/defineErrors.ts ──► CatalogError.ts ◄───────┤
         │      │      │                                │
         ▼      ▼      ▼                                │
   issues.ts schema.ts openapi.ts ──► format.ts ◄───────┘
```

Dependencies point one way: adapters depend on the core, the core never imports an adapter, and the core has no runtime dependencies (only `node:util`).

## Code map

- **`src/index.ts`**: the public API of `.`; only re-exports. Anything not re-exported here (or from an adapter) is internal.
- **`src/core/CatalogError.ts`**: the base class. `toJSON()` is the client body; `toProblem()` is the RFC 9457 body; `toString()` is the log line.
- **`src/core/defineErrors.ts`**: `defineErrors`, the spec types (`ErrorSpec`, `Specs`) and the generated class types (`ErrorClass`, `Catalog`). One class per key, plus `schema`, `problemSchema` and `openapi`.
- **`src/core/issues.ts`**: `Issue` (the Standard Schema issue shape) and the `fromIssues` message format.
- **`src/core/schema.ts`**: `BodySchema` and `ProblemSchema`, the JSON Schemas of both bodies, built from the codes and statuses.
- **`src/core/openapi.ts`**: `OpenApiComponents`, the schema plus one response per error, for one format.
- **`src/core/format.ts`**: `ErrorFormat` (`json` | `problem`), its media types and `bodyOf`, the one place that picks a body for a format. Adapters and `openapi` share it.
- **`src/adapters/express.ts`**: `errorHandler` and `ErrorHandlerOptions`, published as `./express`. Express is an optional peer, imported only as `import type`.
- **`src/adapters/fastify.ts`**: the same for Fastify, published as `./fastify`; its `errorHandler` goes to `setErrorHandler`.
- **`src/adapters/hono.ts`**: the same for Hono, published as `./hono`; its `errorHandler` goes to `app.onError`.
- **`test/`** mirrors `src/`: `test/core/*.test.ts`, `test/adapters/*.test.ts`, and `test/catalog.ts`, the catalog the core tests share.

## Public API

| Entry       | Exports                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`         | `defineErrors`, `CatalogError`; types `Catalog`, `ErrorClass`, `ErrorSpec`, `Specs`, `Issue`, `BodySchema`, `ProblemSchema`, `ProblemDetails`, `ErrorFormat`, `OpenApiComponents`, `OpenApiResponse` |
| `./express` | `errorHandler`; type `ErrorHandlerOptions`                                                                                                                                                           |
| `./fastify` | `errorHandler`; type `ErrorHandlerOptions`                                                                                                                                                           |
| `./hono`    | `errorHandler`; type `ErrorHandlerOptions`                                                                                                                                                           |

Changing any of these is a change to the public API: see versioning in [AGENTS.md](AGENTS.md).

## Invariants

- **Body.** `toJSON()` returns `{ code, message }`, or `{ message }` when the error has no code: never `detail`, `statusCode` or `stack`. It is the only thing a client ever sees.
- **Problem body.** `toProblem()` returns `{ type?, title, status, detail?, code? }`: `title` is the spec's default message, `status` the instance's `statusCode`, `type` and `code` only when the spec has them, and `detail` is the instance's `message` only when it differs from `title`. It is the public message: the internal `detail` never reaches it. `toJSON()` does not change.
- **Log line.** `toString()` is one line of JSON with `code`, `message`, `statusCode` and `detail`. Errors anywhere in `detail` become `{ name, message, stack }` (their props are non-enumerable). A circular or BigInt `detail` falls back to `util.inspect`, never throws. A 5xx also carries its own `stack`, unless `detail` is an `Error`; a 4xx never does.
- **Spec defaults.** Only `statusCode` is required. Without `message`, the key is the message; without `code`, there is no code anywhere (body, log, schema). A list of statuses (`[503, 504]`) makes the constructor require one of them; `fromIssues` on such a class uses the first.
- **Names.** Each class and its instances are named after their key, so stack traces read `NotFoundError: ...`. `instanceof` works with the class and with `CatalogError`.
- **Catalog members are reserved.** A key named `schema`, `problemSchema` or `openapi` fails to typecheck and throws a `TypeError` at runtime: they are the catalog's own members (the JSON Schemas and `openapi()`).
- **OpenAPI.** `errors.openapi({ format })` returns `{ schemas, responses }` for one format: schema `ErrorBody` or `ProblemDetails`, and one response per error key (description is its default message, one example from a default instance). Responses reference the schema by `$ref`, so the result goes into `components` as is. It does not know routes, so the app maps statuses to responses.
- **Body schema.** `code` is an `enum` of the codes the catalog declares; required only when every error has one, absent when none has. `additionalProperties: false`.
- **Issues format.** `fromIssues(message, issues)` gives `<message>: <path>: <issue>; <path>: <issue>`. Paths are joined with `.`; an issue without a path has no prefix. Any object with `{ message, path? }` works (zod, Valibot, ArkType; Joi and class-validator with the README's recipes).
- **Adapter handlers (Express, Fastify, Hono).** A `CatalogError` is answered as is; anything else goes through `fallback` first. `log` always gets the final error. Then: if the client closed the connection (`destroyed`), nothing is written; if headers were sent on `text/event-stream`, it writes `event: error` with the body and ends; if sent on any other content type, it ends without a body; otherwise it answers `statusCode` with the body and its media type. The body is `toJSON()` (`application/json`) or, with `format: "problem"`, `toProblem()` (`application/problem+json`). Fastify never calls the handler for a hijacked reply, and a missing route needs `setNotFoundHandler` (Hono: `app.notFound`). The Hono handler has no destroyed or headers-sent cases: it returns a `Response` built with `c.body`, which keeps the headers earlier middleware set, and streaming helpers report their errors to their own `onError`.

## Build and publishing

- **No build to develop.** `exports` points to `src/*.ts`; tests run them with `tsx`, and a workspace that depends on the package runs its sources too.
- **`dist/` only to publish.** `pnpm build` (`tsc -p tsconfig.build.json`, NodeNext, `.js` + `.d.ts`) emits `dist/` with the same folders as `src/`. `publishConfig.exports` points npm to it, and `files: ["dist"]` keeps the tarball to `dist/`, `README.md`, `LICENSE` and `package.json`.
- **Published from CI when `version` changes on `main`.** `publish.yml` publishes only a version npm doesn't have yet, after rerunning `ci.yml`, with npm trusted publishing (OIDC), so no npm token lives in the repo. It tags `v<version>` after publishing, so every tag is a version on npm, and creates its GitHub Release from that tag.
- **Repository rules in `.github/rulesets/`.** `main.json`: `main` changes only through a PR (no direct push, force push or deletion, no bypass). `tags.json`: nobody creates, moves or deletes a tag; the only bypass is a write deploy key whose private half is the `TAG_DEPLOY_KEY` secret, used by `publish.yml`. A personal repo can't list GitHub Actions itself as a bypass, hence the deploy key.
- **ESM only.** CommonJS consumers load it with `require(esm)` (Node 20.19+, 22.12+).

## Decisions

- **Own library, not `http-errors`, `@hapi/boom` or `@fastify/error`.** None ties a typed code to a fixed body, its JSON Schema and a safe one-line log; with any of them the app still owns `toJSON`, `toString` and the validation message.
- **A fixed body, `{ code?, message }`, and one alternative: RFC 9457.** No free-form body option: a configurable body would need a configurable schema and adapter. RFC 9457 was the shape to revisit, and it is added without touching the default: `toProblem()`, `errors.problemSchema` and `format: "problem"` in the adapters. The default stays `json` because changing it would break every client of the existing body.
- **`title` is the catalog message, `detail` the public message.** RFC 9457 `detail` is visible to clients, so it must never be the internal `detail`; it comes from `message`, which `toJSON()` already sends. No `publicDetail` field: that would be a second public message to keep in sync. `type` is an optional spec field, with no default URI, because inventing one would make up a namespace for the app.
- **`openapi()` per catalog, not a function over specs.** The catalog already holds the classes and codes, so it builds its own components; a separate function would make the app pass the specs twice.
- **`code` and `message` optional.** Not every organization has business codes; the key is a readable default message.
- **`statusCode`, not `status`.** It matches Node's `res.statusCode` and keeps one name in the spec, the instance and the log line.
- **A plain JSON Schema, no zod.** Zero runtime dependencies; any OpenAPI generator takes a JSON Schema.
- **No adapter per validation library.** `Issue` is the Standard Schema shape, so zod, Valibot and ArkType work as they are; Joi and class-validator get a recipe in the README. An adapter is added when a user asks for one.
- **`; ` between issues.** Validation libraries put commas inside their messages (`expected string, received undefined`), so a comma separator hides where an issue ends.
- **Own stack only for a 5xx without an `Error` in `detail`.** A 4xx is expected, not a bug, and its stack is noise; an `Error` in `detail` already says where it failed.
- **`core/` and `adapters/`, no `ports/` or interfaces.** One file per responsibility is enough at this size; a new framework is one file in `adapters/` and a new subpath in `exports`. Fastify was the second adapter because its tests need no extra server package (`app.listen(0)`); Hono's tests need `@hono/node-server` (a dev dependency) to listen on a real port.
- **ESM only, built with `tsc`.** No bundler and no dual build to maintain; `require(esm)` covers CommonJS.
- **Test names without ticket or spec ids.** The package is open source; names describe behavior.
