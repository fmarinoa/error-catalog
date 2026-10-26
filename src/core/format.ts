import type { CatalogError } from "./CatalogError.js";

/** `json`: `{ code?, message }`. `problem`: RFC 9457, served as `application/problem+json`. */
export type ErrorFormat = "json" | "problem";

export const mediaType = {
  json: "application/json",
  problem: "application/problem+json",
} as const satisfies Record<ErrorFormat, string>;

export const bodyOf = (error: CatalogError, format: ErrorFormat) =>
  format === "problem" ? error.toProblem() : error.toJSON();
