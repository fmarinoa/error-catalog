// the public API; files under core/ are internal (package.json exports only . and ./express)
export { CatalogError } from "./core/CatalogError.js";
export { defineErrors } from "./core/defineErrors.js";
export type {
  Catalog,
  ErrorClass,
  ErrorSpec,
  Specs,
} from "./core/defineErrors.js";
export type { Issue } from "./core/issues.js";
export type { BodySchema } from "./core/schema.js";
