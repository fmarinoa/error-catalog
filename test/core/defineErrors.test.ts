import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CatalogError, defineErrors } from "../../src/index.js";
import { errors } from "../catalog.js";

const { BadRequestError, UpstreamError, ClientClosedError } = errors;

describe("error classes", () => {
  test("each key is a class; instances are CatalogError and Error, named after the key", () => {
    const error = new BadRequestError();
    assert.ok(error instanceof BadRequestError);
    assert.ok(error instanceof CatalogError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, "BadRequestError");
    assert.equal(error.code, "0.1.0");
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, "Bad Request Error");
    assert.equal(error.detail, undefined);
    assert.equal(new ClientClosedError() instanceof BadRequestError, false);

    const custom = new BadRequestError({ message: "x", detail: 1 });
    assert.equal(custom.message, "x");
    assert.equal(custom.detail, 1);
  });

  test("a list of statuses takes one of them, and the instance keeps it", () => {
    assert.equal(new UpstreamError({ statusCode: 504 }).statusCode, 504);
    assert.equal(new UpstreamError({ statusCode: 503 }).statusCode, 503);
    // @ts-expect-error a status outside the list does not typecheck
    new UpstreamError({ statusCode: 500 });
    // @ts-expect-error a list without statusCode does not typecheck
    new UpstreamError();
  });

  test("without a message, the key is the default message", () => {
    const { BadRequestError } = defineErrors({
      BadRequestError: { statusCode: 400 },
    });
    assert.equal(new BadRequestError().message, "BadRequestError");
    assert.deepEqual(new BadRequestError().toJSON(), {
      message: "BadRequestError",
    });
    assert.equal(new BadRequestError({ message: "x" }).message, "x");
  });

  test("a key named schema is rejected, errors.schema is taken", () => {
    assert.throws(
      () =>
        defineErrors({
          // @ts-expect-error schema is reserved at the type level too
          schema: { statusCode: 400, code: "0.9.0", message: "x" },
        }),
      TypeError,
    );
  });
});
