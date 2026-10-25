# @fmarinoa/error-catalog

Typed HTTP error catalog: one class per error, a `{ code?, message }` body, a JSON Schema for it, a one-line log format, and an Express error handler.

## Install

```sh
npm install @fmarinoa/error-catalog
```

Express is an optional peer, only needed for `@fmarinoa/error-catalog/express`.

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

The key `schema` is reserved for it: a catalog key named `schema` throws.

## Express

```ts
import { errorHandler } from "@fmarinoa/error-catalog/express";

app.use(
  errorHandler({
    // any error that is not a CatalogError becomes one
    fallback: (err) => new InternalError({ detail: err }),
    // gets the final error, answered or not
    log: (error) => console.error(String(error)),
  }),
);
```

- Answers `statusCode` and `toJSON()`.
- Headers already sent on `text/event-stream`: writes `event: error` with the body, then ends.
- Client already disconnected: only calls `log`.

## License

MIT
