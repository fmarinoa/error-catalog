import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { CatalogError } from "../core/CatalogError.js";
import { type ErrorFormat, bodyOf, mediaType } from "../core/format.js";

export interface ErrorHandlerOptions {
  /** Turns any error that isn't a `CatalogError` (a bug, an `HTTPException`) into one. */
  fallback: (err: unknown) => CatalogError;
  /** Gets the final error, answered or not. `String(error)` is its one-line JSON log. */
  log: (error: CatalogError) => void;
  /** `"json"` (default): `{ code?, message }`. `"problem"`: RFC 9457, as `application/problem+json`. */
  format?: ErrorFormat;
}

/**
 * Builds a Hono error handler that answers catalog errors; pass it to `app.onError`.
 *
 * Hono forwards sync throws and rejected promises from handlers and middleware to it, so routes need no try/catch.
 * For each error it:
 * 1. Uses it as is when it is a `CatalogError`, or turns it into one with `fallback`.
 * 2. Calls `log` with it.
 * 3. Answers `statusCode` with `toJSON()` as the body (`{ code?, message }`), or with `toProblem()` and
 *    `application/problem+json` when `format` is `"problem"`. Never `detail` or `stack`.
 *
 * Hono's own errors (`HTTPException`, a malformed JSON body) reach `fallback` too: map them there.
 * A route that is not found does not reach the error handler: use `app.notFound`.
 *
 * Unlike the Express and Fastify handlers, it has no case for a response already started: Hono answers
 * with a `Response` value, and an error inside `streamSSE` or `stream` goes to that helper's own `onError`
 * callback, not here. Write `event: error` there if you need it.
 *
 * @param options `fallback`, `log` and optionally `format`.
 * @returns The error handler for `app.onError`.
 *
 * @example Basic
 * ```ts
 * import { Hono } from "hono";
 * import { defineErrors } from "@fmarinoa/error-catalog";
 * import { errorHandler } from "@fmarinoa/error-catalog/hono";
 *
 * const { NotFoundError, InternalError } = defineErrors({
 *   NotFoundError: { statusCode: 404 },
 *   InternalError: { statusCode: 500 },
 * });
 *
 * const app = new Hono();
 * app.get("/users/:id", () => {
 *   throw new NotFoundError({ message: "User not found" });
 * });
 * app.onError(
 *   errorHandler({
 *     fallback: (err) => new InternalError({ detail: err }),
 *     log: (error) => console.error(String(error)),
 *   }),
 * );
 * // GET /users/1 -> 404 { "message": "User not found" }
 * ```
 *
 * @example Mapping Hono's own errors in fallback
 * ```ts
 * import { HTTPException } from "hono/http-exception";
 *
 * errorHandler({
 *   fallback: (err) =>
 *     err instanceof HTTPException && err.status === 400
 *       ? new BadRequestError({ message: err.message })
 *       : new InternalError({ detail: err }),
 *   log: (error) => console.error(String(error)),
 * });
 * ```
 *
 * @example RFC 9457 problem details
 * ```ts
 * app.onError(
 *   errorHandler({
 *     fallback: (err) => new InternalError({ detail: err }),
 *     log: (error) => console.error(String(error)),
 *     format: "problem",
 *   }),
 * );
 * // GET /users/1 -> 404 application/problem+json { "title": "NotFoundError", "status": 404, "detail": "User not found" }
 * ```
 */
export function errorHandler({
  fallback,
  log,
  format = "json",
}: ErrorHandlerOptions): ErrorHandler {
  return (err, c) => {
    const error = err instanceof CatalogError ? err : fallback(err);
    log(error);

    // c.body keeps the headers earlier middleware set (CORS), and sets no content type of its own
    return c.body(
      JSON.stringify(bodyOf(error, format)),
      error.statusCode as ContentfulStatusCode,
      { "content-type": mediaType[format] },
    );
  };
}
