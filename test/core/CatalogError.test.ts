import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defineErrors } from "../../src/index.js";
import { errors } from "../catalog.js";

const { BadRequestError, UpstreamError } = errors;

describe("body and log", () => {
  test("toJSON returns only code and message", () => {
    const error = new UpstreamError({
      statusCode: 504,
      detail: { secret: "x" },
    });
    assert.deepEqual(error.toJSON(), {
      code: "0.2.0",
      message: "LLM provider unavailable",
    });
    assert.equal(
      JSON.stringify(error),
      '{"code":"0.2.0","message":"LLM provider unavailable"}',
    );
  });

  test("without a code, the body and the log leave it out", () => {
    const { NotFound } = defineErrors({
      NotFound: { statusCode: 404, message: "Not Found" },
    });
    const error = new NotFound({ detail: 1 });
    assert.equal(error.code, undefined);
    assert.deepEqual(error.toJSON(), { message: "Not Found" });
    assert.deepEqual(JSON.parse(String(error)), {
      message: "Not Found",
      statusCode: 404,
      detail: 1,
    });
  });

  test("toString is one line of JSON, and errors inside detail become name, message and stack", () => {
    const cause = new TypeError("boom");
    const error = new UpstreamError({ statusCode: 503, detail: { cause } });
    const line = String(error);
    assert.equal(line.includes("\n"), false);
    assert.deepEqual(JSON.parse(line), {
      code: "0.2.0",
      message: "LLM provider unavailable",
      statusCode: 503,
      detail: {
        cause: { name: "TypeError", message: "boom", stack: cause.stack },
      },
      stack: error.stack,
    });
  });

  test("a 5xx logs its own stack unless detail is an Error; a 4xx never does", () => {
    const error = new UpstreamError({ statusCode: 503 });
    assert.equal(JSON.parse(String(error)).stack, error.stack);
    assert.match(error.stack ?? "", /^UpstreamError: LLM provider unavailable/);

    const cause = new Error("boom");
    const wrapped = JSON.parse(
      String(new UpstreamError({ statusCode: 503, detail: cause })),
    );
    assert.equal(wrapped.stack, undefined);
    assert.equal(wrapped.detail.stack, cause.stack);

    assert.equal(JSON.parse(String(new BadRequestError())).stack, undefined);
  });

  test("circular or BigInt detail falls back to inspect without throwing", () => {
    const circular: Record<string, unknown> = { n: 1 };
    circular.self = circular;
    const parsed = JSON.parse(
      String(new BadRequestError({ detail: circular })),
    );
    assert.equal(parsed.code, "0.1.0");
    assert.equal(parsed.statusCode, 400);
    assert.match(parsed.detail, /Circular/);

    assert.match(
      String(new BadRequestError({ detail: { n: 1n } })),
      /"detail":"\{ n: 1n \}"/,
    );
  });
});

describe("problem details", () => {
  const { NotFoundError } = defineErrors({
    NotFoundError: {
      statusCode: 404,
      code: "0.4.0",
      message: "Not Found",
      type: "https://example.com/problems/not-found",
    },
  });

  test("toProblem is title, status, code and type, with the message as detail only when it changes", () => {
    assert.deepEqual(new NotFoundError().toProblem(), {
      type: "https://example.com/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "0.4.0",
    });
    assert.deepEqual(
      new NotFoundError({ message: "no such user" }).toProblem(),
      {
        type: "https://example.com/problems/not-found",
        title: "Not Found",
        status: 404,
        detail: "no such user",
        code: "0.4.0",
      },
    );
  });

  test("the internal detail never reaches the problem", () => {
    const error = new NotFoundError({ detail: { secret: "x" } });
    assert.equal(JSON.stringify(error.toProblem()).includes("secret"), false);
    assert.equal("detail" in error.toProblem(), false);
  });

  test("without a type or a code, the problem leaves them out; the status is the instance's", () => {
    const { Forbidden } = defineErrors({ Forbidden: { statusCode: 403 } });
    assert.deepEqual(new Forbidden().toProblem(), {
      title: "Forbidden",
      status: 403,
    });
    assert.equal(
      new UpstreamError({ statusCode: 504 }).toProblem().status,
      504,
    );
  });

  test("fromIssues puts the issues in detail and keeps the default title", () => {
    const error = BadRequestError.fromIssues("Invalid input", [
      { message: "required", path: ["name"] },
    ]);
    assert.deepEqual(error.toProblem(), {
      title: "Bad Request Error",
      status: 400,
      detail: "Invalid input: name: required",
      code: "0.1.0",
    });
  });
});
