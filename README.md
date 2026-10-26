# @fmarinoa/error-catalog

[![npm](https://img.shields.io/npm/v/@fmarinoa/error-catalog)](https://www.npmjs.com/package/@fmarinoa/error-catalog)
[![CI](https://github.com/fmarinoa/error-catalog/actions/workflows/ci.yml/badge.svg)](https://github.com/fmarinoa/error-catalog/actions/workflows/ci.yml)
[![types](https://img.shields.io/npm/types/@fmarinoa/error-catalog)](https://www.npmjs.com/package/@fmarinoa/error-catalog)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/npm/l/@fmarinoa/error-catalog)](LICENSE)

Define your HTTP errors once. Get typed classes, the JSON body clients see, a one-line log format that never leaks internals, and the JSON Schema and OpenAPI components that describe them. Express, Fastify and Hono adapters answer them; RFC 9457 problem details are one option away.

```ts
import { defineErrors } from "@fmarinoa/error-catalog";
import { errorHandler } from "@fmarinoa/error-catalog/express";

const errors = defineErrors({
  NotFoundError: { statusCode: 404, code: "0.4.0", message: "Not Found" },
  InternalError: {
    statusCode: 500,
    code: "0.5.0",
    message: "Internal Server Error",
  },
});
export const { NotFoundError, InternalError } = errors;

app.get("/users/:id", (req) => {
  throw new NotFoundError({
    message: "User not found",
    detail: { id: req.params.id }, // for your logs, never sent to the client
  });
});

app.use(
  errorHandler({
    fallback: (err) => new InternalError({ detail: err }), // anything that isn't a catalog error
    log: (error) => console.error(String(error)),
  }),
);
```

```text
GET /users/1  ->  404  { "code": "0.4.0", "message": "User not found" }
log           ->  {"code":"0.4.0","message":"User not found","statusCode":404,"detail":{"id":"1"}}
```

The same catalog gives you `errors.schema` (JSON Schema of that body) and `errors.openapi()` (OpenAPI `components` with one response per error), so the docs come from the same definition as what the server sends.

## Install

```sh
npm install @fmarinoa/error-catalog
```

ESM only; CommonJS loads it with `require(esm)` (Node 20.19+, 22.12+). Express 5, Fastify 5 and Hono 4 are optional peers, needed only for their adapter: `@fmarinoa/error-catalog/express`, `/fastify` and `/hono`.

## How it compares

|                                   | this package                                       | [http-errors](https://www.npmjs.com/package/http-errors) | [@hapi/boom](https://www.npmjs.com/package/@hapi/boom) | [@fastify/error](https://www.npmjs.com/package/@fastify/error) |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| One typed class per app error     | yes, from a catalog                                | one per HTTP status                                      | one factory per HTTP status                            | yes, one `createError` call each                               |
| Business code on the error        | `code`, in body, log and schema                    | no                                                       | no                                                     | `code` (a string)                                              |
| Fixed client body                 | `{ code?, message }`                               | up to the framework                                      | `{ statusCode, error, message }`                       | Fastify's default                                              |
| JSON Schema / OpenAPI of the body | yes                                                | no                                                       | no                                                     | no                                                             |
| One-line log that hides internals | yes (`String(error)`)                              | no                                                       | no                                                     | no                                                             |
| RFC 9457 problem details          | `toProblem()`                                      | no                                                       | no                                                     | no                                                             |
| Frameworks                        | Express 5, Fastify 5, Hono 4 (core works anywhere) | any; Express's default handler reads its fields          | any; made for hapi                                     | Fastify                                                        |
| Maturity                          | 0.x, one maintainer                                | years in production                                      | years in production                                    | years in production                                            |

Pick something else when:

- You only need standard status errors and nothing more: `http-errors` is enough, and Express already understands it.
- You build on hapi: use `@hapi/boom`.
- You need Express 4, Koa or NestJS: there is no adapter yet. The core still works, since you call `toJSON()` or `toProblem()` yourself, but you would write that glue.

This package pays off when you want one catalog to drive the error classes, the response body, the logs and the API docs together.

## defineErrors

```ts
import { defineErrors } from "@fmarinoa/error-catalog";

export const errors = defineErrors({
  BadRequestError: {
    statusCode: 400,
    code: "0.1.0",
    message: "Bad Request Error",
  },
  UpstreamError: {
    statusCode: [503, 504],
    code: "0.2.0",
    message: "Upstream unavailable",
    type: "https://example.com/problems/upstream", // optional, only for toProblem()
  },
});

export const { BadRequestError, UpstreamError } = errors;

new BadRequestError(); // default message
new BadRequestError({ message: "x", detail: cause }); // detail is never sent to clients
new UpstreamError({ statusCode: 504, detail: cause }); // a list of statuses: one is required
```

- Each key becomes a class. Instances are `CatalogError` and `Error`, with `name` equal to the key.
- `message` is optional: without it, the key is the default message (`new BadRequestError().message` is `"BadRequestError"`).
- `code` is optional: a business code for organizations that have one. Without it, the body is `{ message }` and the log line has no `code`.
- `err.toJSON()` returns `{ code, message }` only.
- `err.toProblem()` returns the same error as [RFC 9457 problem details](#problem-details-rfc-9457).
- `String(err)` returns one line of JSON with `code`, `message`, `statusCode` and `detail`. Errors inside `detail` become `{ name, message, stack }`. Circular or BigInt details fall back to `util.inspect`. A 5xx also logs its own `stack`, unless `detail` is an `Error` (its stack already says where it failed); a 4xx never does.

## fromIssues

Builds an error from validation issues: each one as `path: message`, joined with `; `. An issue is `{ message, path? }`, the [Standard Schema](https://standardschema.dev) shape:

```ts
const error = BadRequestError.fromIssues(
  "Invalid login input",
  result.error.issues,
);
// "Invalid login input: username: Invalid input: expected string, received undefined; password: Too small: expected string to have >=8 characters"
```

### Validation libraries

zod, Valibot, ArkType and any other Standard Schema library: pass their issues as they are.

```ts
BadRequestError.fromIssues("Invalid login input", result.error.issues); // zod
```

Joi: its messages already name the field, so leave the path out.

```ts
const { error } = schema.validate(body, {
  abortEarly: false,
  errors: { wrap: { label: false } },
});
BadRequestError.fromIssues(
  "Invalid login input",
  error.details.map(({ message }) => ({ message })),
);
// "Invalid login input: username is required; address.zip must be a number"
```

class-validator: its errors are a tree, so flatten it.

```ts
import type { Issue } from "@fmarinoa/error-catalog";
import type { ValidationError } from "class-validator";

const toIssues = (errors: ValidationError[], path: string[] = []): Issue[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}).map((message) => ({
      message,
      path: [...path, error.property],
    })),
    ...toIssues(error.children ?? [], [...path, error.property]),
  ]);

BadRequestError.fromIssues(
  "Invalid login input",
  toIssues(await validate(input)),
);
// "Invalid login input: username: username should not be empty; address.zip: zip must be a number ..."
```

## schema

`errors.schema` is the JSON Schema of the body, with `code` as an enum of the catalog codes. `code` is required only when every error has one, and absent when none has:

```ts
errors.schema; // { type: "object", properties: { code: { enum: [...] }, message: { type: "string" } }, ... }
```

`errors.problemSchema` is the same for `toProblem()`, with `status` as an enum of the declared statuses.

## Problem details (RFC 9457)

`err.toProblem()` is the same error as an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem, for APIs that serve `application/problem+json`. `toJSON()` is unchanged, so this is opt-in:

```ts
const { NotFoundError } = defineErrors({
  NotFoundError: {
    statusCode: 404,
    code: "0.4.0",
    message: "Not Found",
    type: "https://example.com/problems/not-found",
  },
});

new NotFoundError({ message: "Conversation not found" }).toProblem();
// {
//   type: "https://example.com/problems/not-found",
//   title: "Not Found",
//   status: 404,
//   detail: "Conversation not found",
//   code: "0.4.0",
// }
```

How the spec maps to the problem:

| Problem member | Comes from                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `type`         | the spec's `type`; left out without one, which RFC 9457 reads as `about:blank`                                  |
| `title`        | the spec's default `message` (the key without one): it names the kind of error                                  |
| `status`       | `statusCode` of the instance                                                                                    |
| `detail`       | the instance's `message`, only when it differs from `title`. It is already public; the internal `detail` is not |
| `code`         | the spec's `code`, as an extension member; left out without one                                                 |

Two things to know:

- The internal `detail` option (what you pass as `detail: cause`) never reaches the problem. `detail` in the problem is the public `message` of that occurrence.
- RFC 9457 suggests that, for `about:blank`, `title` be the HTTP status phrase. Here it is your catalog message instead, which is more specific; set a `type` if you want consumers to key on it.

`errors.problemSchema` is its JSON Schema, and both adapters answer problems with `format: "problem"`.

## OpenAPI

`errors.schema` and `errors.problemSchema` are plain JSON Schema. `errors.openapi()` goes one step further and returns the `components` of an OpenAPI 3.x document: the body schema and one response per error, each with an example.

```ts
const errors = defineErrors({
  NotFoundError: { statusCode: 404, code: "0.4.0", message: "Not Found" },
});

const document = {
  openapi: "3.1.0",
  info: { title: "API", version: "1.0.0" },
  paths: {
    "/users/{id}": {
      get: {
        responses: { "404": { $ref: "#/components/responses/NotFoundError" } },
      },
    },
  },
  components: errors.openapi(), // { schemas: { ErrorBody }, responses: { NotFoundError } }
};
```

- `errors.openapi({ format: "problem" })` documents `toProblem()` instead: the `ProblemDetails` schema and `application/problem+json` responses.
- You choose which status each route returns: the response is keyed by error name, not by status. An error with a list of statuses (`[503, 504]`) is exemplified with the first one.

The keys `schema`, `problemSchema` and `openapi` are reserved: a catalog key with one of those names throws.

## Express

```ts
import { errorHandler } from "@fmarinoa/error-catalog/express";

app.use(
  errorHandler({
    // any error that is not a CatalogError becomes one
    fallback: (err) => new InternalError({ detail: err }),
    // gets the final error, answered or not
    log: (error) => console.error(String(error)),
    // optional: "problem" answers toProblem() as application/problem+json
    format: "problem",
  }),
);
```

- Answers `statusCode` and `toJSON()` (or `toProblem()` with `format: "problem"`).
- Headers already sent on `text/event-stream`: writes `event: error` with the body, then ends.
- Client already disconnected: only calls `log`.

## Fastify

```ts
import { errorHandler } from "@fmarinoa/error-catalog/fastify";
import Fastify from "fastify";

const app = Fastify();

app.setErrorHandler(
  errorHandler({
    fallback: (err) => new InternalError({ detail: err }),
    log: (error) => console.error(String(error)),
    // optional: "problem" answers toProblem() as application/problem+json
    format: "problem",
  }),
);
```

- Same behavior as the Express handler. Fastify's own errors (invalid JSON body, schema validation) reach `fallback` with their `statusCode`, so map them there.
- A route that doesn't exist doesn't reach the error handler: answer it with `app.setNotFoundHandler`.
- After `reply.hijack()` Fastify never calls the error handler: the route owns its errors.

## Hono

```ts
import { errorHandler } from "@fmarinoa/error-catalog/hono";
import { Hono } from "hono";

const app = new Hono();

app.onError(
  errorHandler({
    fallback: (err) => new InternalError({ detail: err }),
    log: (error) => console.error(String(error)),
    // optional: "problem" answers toProblem() as application/problem+json
    format: "problem",
  }),
);
```

- Answers `statusCode` with `toJSON()` (or `toProblem()` with `format: "problem"`). Headers that earlier middleware set, like CORS, are kept.
- Hono's own errors (`HTTPException`, a malformed JSON body) reach `fallback`, so map them there.
- A route that doesn't exist doesn't reach `onError`: answer it with `app.notFound`.
- There is no case for a response already started, as in Express and Fastify: an error inside `streamSSE` goes to that helper's own `onError` callback, where you write `event: error` yourself.
- It works on any runtime Hono runs on, since it only builds a `Response`; the adapter imports `hono` for types only.

## License

MIT
