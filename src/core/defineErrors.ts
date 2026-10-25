import { CatalogError } from "./CatalogError.js";
import { type Issue, withIssues } from "./issues.js";
import { type BodySchema, bodySchema } from "./schema.js";

export interface ErrorSpec {
  // a list: the constructor must get one of them
  statusCode: number | readonly number[];
  // a business code, for organizations that have one
  code?: string;
  // without one, the key is the message
  message?: string;
}

export type Specs = Record<string, ErrorSpec>;

type Status<C> = C extends readonly (infer N extends number)[]
  ? N
  : C extends number
    ? C
    : never;

type Props<C> = C extends readonly number[]
  ? { message?: string; detail?: unknown; statusCode: C[number] }
  : { message?: string; detail?: unknown };

type CtorArgs<C> = {} extends Props<C> ? [props?: Props<C>] : [props: Props<C>];

export type ErrorClass<C> = {
  new (...args: CtorArgs<C>): CatalogError<Status<C>>;
  fromIssues(
    message: string,
    issues: readonly Issue[],
  ): CatalogError<Status<C>>;
  readonly prototype: CatalogError<Status<C>>;
};

export type Catalog<T extends Specs> = {
  [K in keyof T & string]: ErrorClass<T[K]["statusCode"]>;
} & { readonly schema: BodySchema };

function errorClass(name: string, spec: ErrorSpec) {
  // with a list and no statusCode passed (JS callers), the first one wins
  const defaultStatus =
    typeof spec.statusCode === "number" ? spec.statusCode : spec.statusCode[0];
  return {
    [name]: class extends CatalogError {
      static fromIssues(message: string, issues: readonly Issue[]) {
        return new this({ message: withIssues(message, issues) });
      }

      constructor(
        props: { message?: string; detail?: unknown; statusCode?: number } = {},
      ) {
        super({
          name,
          code: spec.code,
          statusCode: props.statusCode ?? defaultStatus,
          message: props.message ?? spec.message ?? name,
          detail: props.detail,
        });
      }
    },
  }[name];
}

/**
 * Builds a typed error catalog: each key becomes an error class.
 *
 * Every class extends `CatalogError` (and `Error`), with `name` equal to its key, and has:
 * - `toJSON()`: the body a client sees, `{ code?, message }`; never `detail`, `statusCode` or `stack`.
 * - `toString()`: one line of JSON for logs, with `code`, `message`, `statusCode` and `detail`, plus `stack` for a 5xx whose `detail` is not an `Error`.
 * - `fromIssues(message, issues)`: an error from validation issues (Standard Schema shape).
 *
 * The catalog also has `schema`, the JSON Schema of the body, so the key `schema` is reserved.
 *
 * @param specs One entry per error:
 * - `statusCode`: required. A list (`[503, 504]`) makes the constructor require one of them.
 * - `code`: optional business code. Without it, the body is `{ message }`.
 * - `message`: optional default message. Without it, the key is the message.
 * @returns One class per key, plus `schema`.
 * @throws {TypeError} When a key is named `schema`.
 *
 * @example Define and throw
 * ```ts
 * export const { NotFoundError, UpstreamError } = defineErrors({
 *   NotFoundError: { statusCode: 404, code: "0.4.0", message: "Not Found" },
 *   UpstreamError: { statusCode: [503, 504], message: "Upstream unavailable" },
 * });
 *
 * throw new NotFoundError({ message: "Conversation not found" });
 * // body: { code: "0.4.0", message: "Conversation not found" }
 *
 * throw new UpstreamError({ statusCode: 504, detail: err });
 * // detail goes to the log line, never to the client
 * ```
 *
 * @example Without code or message
 * ```ts
 * const { Forbidden } = defineErrors({ Forbidden: { statusCode: 403 } });
 *
 * new Forbidden().toJSON(); // { message: "Forbidden" }
 * ```
 *
 * @example Validation issues (zod, or any Standard Schema library)
 * ```ts
 * const result = LoginRequest.safeParse(body);
 * if (!result.success) {
 *   throw BadRequestError.fromIssues("Invalid login input", result.error.issues);
 *   // "Invalid login input: username: Invalid input: expected string, received undefined"
 * }
 * ```
 *
 * @example Express error handler
 * ```ts
 * import { errorHandler } from "@fmarinoa/error-catalog/express";
 *
 * app.use(
 *   errorHandler({
 *     fallback: (err) => new InternalError({ detail: err }),
 *     log: (error) => console.error(String(error)),
 *   }),
 * );
 * ```
 *
 * @example OpenAPI
 * ```ts
 * const errors = defineErrors({ ... });
 *
 * openapi.components.schemas.ErrorBody = errors.schema;
 * ```
 */
export function defineErrors<const T extends Specs>(
  specs: T & { schema?: never },
): Catalog<T> {
  if ("schema" in specs) {
    throw new TypeError('error key "schema" is reserved for errors.schema');
  }
  const catalog: Record<string, unknown> = {
    schema: bodySchema(Object.values(specs).map((spec) => spec.code)),
  };
  for (const [name, spec] of Object.entries(specs)) {
    catalog[name] = errorClass(name, spec);
  }
  return catalog as unknown as Catalog<T>;
}
