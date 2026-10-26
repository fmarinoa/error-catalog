import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defineErrors } from "../../src/index.js";
import { errors } from "../catalog.js";

describe("body schema", () => {
  test("errors.schema is the body JSON Schema, with code as an enum of the catalog codes", () => {
    assert.deepEqual(errors.schema, {
      type: "object",
      properties: {
        code: { type: "string", enum: ["0.1.0", "0.2.0", "0.3.0"] },
        message: { type: "string" },
      },
      required: ["code", "message"],
      additionalProperties: false,
    });
  });

  test("code is optional when some error has none, and absent when none has", () => {
    const mixed = defineErrors({
      NotFound: { statusCode: 404 },
      Locked: { statusCode: 429, code: "0.7.0" },
    });
    assert.deepEqual(mixed.schema, {
      type: "object",
      properties: {
        code: { type: "string", enum: ["0.7.0"] },
        message: { type: "string" },
      },
      required: ["message"],
      additionalProperties: false,
    });

    const none = defineErrors({ NotFound: { statusCode: 404 } });
    assert.deepEqual(none.schema, {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    });
  });
});

describe("problem schema", () => {
  test("errors.problemSchema describes toProblem, with the declared codes and statuses as enums", () => {
    assert.deepEqual(errors.problemSchema, {
      type: "object",
      properties: {
        type: { type: "string", format: "uri-reference" },
        title: { type: "string" },
        status: { type: "integer", enum: [400, 499, 503, 504] },
        detail: { type: "string" },
        code: { type: "string", enum: ["0.1.0", "0.2.0", "0.3.0"] },
      },
      required: ["title", "status", "code"],
      additionalProperties: false,
    });
  });

  test("code is optional when some error has none, and absent when none has", () => {
    const mixed = defineErrors({
      NotFound: { statusCode: 404 },
      Locked: { statusCode: 429, code: "0.7.0" },
    });
    assert.deepEqual(mixed.problemSchema.required, ["title", "status"]);
    assert.deepEqual(mixed.problemSchema.properties.code, {
      type: "string",
      enum: ["0.7.0"],
    });

    const none = defineErrors({ NotFound: { statusCode: 404 } });
    assert.deepEqual(none.problemSchema.required, ["title", "status"]);
    assert.equal("code" in none.problemSchema.properties, false);
  });
});
