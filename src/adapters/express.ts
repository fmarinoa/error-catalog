import type { ErrorRequestHandler } from "express";

import { CatalogError } from "../core/CatalogError.js";

export interface ErrorHandlerOptions {
  /** Turns any error that isn't a `CatalogError` (a bug, a library's error) into one. */
  fallback: (err: unknown) => CatalogError;
  /** Gets the final error, answered or not. `String(error)` is its one-line JSON log. */
  log: (error: CatalogError) => void;
}

/**
 * Builds an Express error handler that answers catalog errors.
 *
 * Express 5 forwards sync throws and rejected promises to it, so routes need no try/catch.
 * For each error it:
 * 1. Uses it as is when it is a `CatalogError`, or turns it into one with `fallback`.
 * 2. Calls `log` with it.
 * 3. Answers `statusCode` with `toJSON()` as the body (`{ code?, message }`), never `detail` or `stack`.
 *
 * When the answer can't be a normal response:
 * - The client already closed the connection: it only logs, nothing is written.
 * - Headers already sent on `text/event-stream` (SSE): the status can't change, so it writes
 *   `event: error` with `toJSON()` as data and ends the stream.
 * - Headers already sent on any other content type: it ends the response without a body.
 *
 * @param options `fallback` and `log`.
 * @returns The error-handling middleware; mount it after every route.
 *
 * @example Basic
 * ```ts
 * import express from "express";
 * import { defineErrors } from "@fmarinoa/error-catalog";
 * import { errorHandler } from "@fmarinoa/error-catalog/express";
 *
 * const { NotFoundError, InternalError } = defineErrors({
 *   NotFoundError: { statusCode: 404 },
 *   InternalError: { statusCode: 500 },
 * });
 *
 * const app = express();
 * app.get("/users/:id", () => {
 *   throw new NotFoundError({ message: "User not found" });
 * });
 * app.use(
 *   errorHandler({
 *     fallback: (err) => new InternalError({ detail: err }),
 *     log: (error) => console.error(String(error)),
 *   }),
 * );
 * // GET /users/1 -> 404 { "message": "User not found" }
 * ```
 *
 * @example Mapping a library's errors in fallback (invalid JSON from express.json())
 * ```ts
 * errorHandler({
 *   fallback: (err) =>
 *     err instanceof SyntaxError && "type" in err && err.type === "entity.parse.failed"
 *       ? new BadRequestError({ message: "invalid JSON body" })
 *       : new InternalError({ detail: err }),
 *   log: (error) => console.error(String(error)),
 * });
 * ```
 *
 * @example Skipping an error before the handler (client gone: not a failure, nothing to answer)
 * ```ts
 * const handle = errorHandler({ fallback, log });
 *
 * const onError: ErrorRequestHandler = (err, req, res, next) => {
 *   if (err instanceof ClientClosedError) return console.info(String(err));
 *   handle(err, req, res, next);
 * };
 * app.use(onError);
 * ```
 */
export function errorHandler({
  fallback,
  log,
}: ErrorHandlerOptions): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const error = err instanceof CatalogError ? err : fallback(err);
    log(error);

    // client already closed the connection: nobody to answer
    if (res.destroyed) return;

    if (res.headersSent) {
      // SSE already sent 200: the status can't change, report it in-band
      if (
        String(res.getHeader("content-type")).startsWith("text/event-stream")
      ) {
        res.end(`event: error\ndata: ${JSON.stringify(error.toJSON())}\n\n`);
      } else {
        res.end();
      }
      return;
    }

    res.status(error.statusCode).json(error.toJSON());
  };
}
