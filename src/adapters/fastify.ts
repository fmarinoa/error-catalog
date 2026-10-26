import type { FastifyReply, FastifyRequest } from "fastify";

import { CatalogError } from "../core/CatalogError.js";
import { type ErrorFormat, bodyOf, mediaType } from "../core/format.js";

export interface ErrorHandlerOptions {
  /** Turns any error that isn't a `CatalogError` (a bug, a plugin's error) into one. */
  fallback: (err: unknown) => CatalogError;
  /** Gets the final error, answered or not. `String(error)` is its one-line JSON log. */
  log: (error: CatalogError) => void;
  /** `"json"` (default): `{ code?, message }`. `"problem"`: RFC 9457, as `application/problem+json`. */
  format?: ErrorFormat;
}

/**
 * Builds a Fastify error handler that answers catalog errors; pass it to `setErrorHandler`.
 *
 * Fastify forwards sync throws and rejected promises from async handlers to it, so routes need no try/catch.
 * For each error it:
 * 1. Uses it as is when it is a `CatalogError`, or turns it into one with `fallback`.
 * 2. Calls `log` with it.
 * 3. Answers `statusCode` with `toJSON()` as the body (`{ code?, message }`), or with `toProblem()` and
 *    `application/problem+json` when `format` is `"problem"`. Never `detail` or `stack`.
 *
 * Fastify's own errors (an invalid JSON body, a failed schema validation) reach `fallback` too, with their
 * `statusCode`. A route that is not found does not reach the error handler: use `setNotFoundHandler`.
 *
 * When the answer can't be a normal response:
 * - The client already closed the connection: it only logs, nothing is written.
 * - Headers already sent on `text/event-stream` (SSE): the status can't change, so it writes
 *   `event: error` with the body as data and ends the stream.
 * - Headers already sent on any other content type: it ends the response without a body.
 *
 * Those two cases are for raw writes (`reply.raw`) without `reply.hijack()`: Fastify never calls the
 * error handler for a hijacked reply, so the route owns its errors there.
 *
 * @param options `fallback`, `log` and optionally `format`.
 * @returns The error handler; register it before the routes it should answer for.
 *
 * @example Basic
 * ```ts
 * import Fastify from "fastify";
 * import { defineErrors } from "@fmarinoa/error-catalog";
 * import { errorHandler } from "@fmarinoa/error-catalog/fastify";
 *
 * const { NotFoundError, InternalError } = defineErrors({
 *   NotFoundError: { statusCode: 404 },
 *   InternalError: { statusCode: 500 },
 * });
 *
 * const app = Fastify();
 * app.setErrorHandler(
 *   errorHandler({
 *     fallback: (err) => new InternalError({ detail: err }),
 *     log: (error) => console.error(String(error)),
 *   }),
 * );
 * app.get("/users/:id", async () => {
 *   throw new NotFoundError({ message: "User not found" });
 * });
 * // GET /users/1 -> 404 { "message": "User not found" }
 * ```
 *
 * @example Mapping Fastify's own errors in fallback (invalid JSON, schema validation)
 * ```ts
 * errorHandler({
 *   fallback: (err) =>
 *     err instanceof Error && "validation" in err
 *       ? new BadRequestError({ message: err.message })
 *       : new InternalError({ detail: err }),
 *   log: (error) => console.error(String(error)),
 * });
 * ```
 *
 * @example RFC 9457 problem details
 * ```ts
 * app.setErrorHandler(
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
}: ErrorHandlerOptions) {
  return (err: unknown, _req: FastifyRequest, reply: FastifyReply): void => {
    const error = err instanceof CatalogError ? err : fallback(err);
    log(error);

    const { raw } = reply;
    // client already closed the connection: nobody to answer
    if (raw.destroyed) return;

    if (raw.headersSent) {
      // SSE already sent 200: the status can't change, report it in-band
      if (
        String(raw.getHeader("content-type")).startsWith("text/event-stream")
      ) {
        raw.end(
          `event: error\ndata: ${JSON.stringify(bodyOf(error, format))}\n\n`,
        );
      } else {
        raw.end();
      }
      return;
    }

    reply
      .status(error.statusCode)
      .type(mediaType[format])
      .send(bodyOf(error, format));
  };
}
