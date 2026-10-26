// the public API; files under core/ are internal (package.json exports only ., ./express and ./fastify)
export { CatalogError } from "./core/CatalogError.js";
export type { ProblemDetails } from "./core/CatalogError.js";
export { defineErrors } from "./core/defineErrors.js";
export type {
  Catalog,
  ErrorClass,
  ErrorSpec,
  Specs,
} from "./core/defineErrors.js";
export type { ErrorFormat } from "./core/format.js";
export type { Issue } from "./core/issues.js";
export type { OpenApiComponents, OpenApiResponse } from "./core/openapi.js";
export type { BodySchema, ProblemSchema } from "./core/schema.js";
