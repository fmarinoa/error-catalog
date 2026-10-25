import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { errors } from "../catalog.js";

const { BadRequestError } = errors;

describe("issues", () => {
  test("fromIssues joins path: message with '; ', nested paths with dots, no prefix without a path", () => {
    const error = BadRequestError.fromIssues("Invalid login input", [
      { message: "Required", path: ["username"] },
      { message: "Too short", path: [{ key: "credentials" }, "password"] },
      { message: "Invalid body" },
    ]);
    assert.ok(error instanceof BadRequestError);
    assert.equal(error.statusCode, 400);
    assert.equal(
      error.message,
      "Invalid login input: username: Required; credentials.password: Too short; Invalid body",
    );
  });
});
