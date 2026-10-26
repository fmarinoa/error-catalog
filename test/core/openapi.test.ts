import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defineErrors } from "../../src/index.js";
import { errors } from "../catalog.js";

describe("openapi components", () => {
  test("openapi() has the body schema and one response per error, each with an example", () => {
    const { schemas, responses } = errors.openapi();

    assert.deepEqual(schemas, { ErrorBody: errors.schema });
    assert.deepEqual(Object.keys(responses), [
      "BadRequestError",
      "UpstreamError",
      "ClientClosedError",
    ]);
    assert.deepEqual(responses.BadRequestError, {
      description: "Bad Request Error",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorBody" },
          example: { code: "0.1.0", message: "Bad Request Error" },
        },
      },
    });
  });

  test("the problem format swaps the schema, the media type and the example", () => {
    const { schemas, responses } = errors.openapi({ format: "problem" });

    assert.deepEqual(schemas, { ProblemDetails: errors.problemSchema });
    assert.deepEqual(responses.ClientClosedError, {
      description: "Client closed request",
      content: {
        "application/problem+json": {
          schema: { $ref: "#/components/schemas/ProblemDetails" },
          example: {
            title: "Client closed request",
            status: 499,
            code: "0.3.0",
          },
        },
      },
    });
  });

  test("an error with a list of statuses is exemplified with the first one", () => {
    const { responses } = errors.openapi({ format: "problem" });
    const content = responses.UpstreamError.content["application/problem+json"];

    assert.equal((content.example as { status: number }).status, 503);
  });

  test("a catalog without codes has no code in its examples", () => {
    const none = defineErrors({ NotFound: { statusCode: 404 } });

    assert.deepEqual(
      none.openapi().responses.NotFound.content["application/json"].example,
      { message: "NotFound" },
    );
  });
});
