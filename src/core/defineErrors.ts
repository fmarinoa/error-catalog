import { CatalogError } from "./CatalogError.js";
import type { ErrorFormat } from "./format.js";
import { type Issue, withIssues } from "./issues.js";
import { type OpenApiComponents, openApiComponents } from "./openapi.js";
import {
  type BodySchema,
  type ProblemSchema,
  bodySchema,
  problemSchema,
} from "./schema.js";

export interface ErrorSpec {
  // a list: the constructor must get one of them
  statusCode: number | readonly number[];
  // a business code, for organizations that have one
  code?: string;
  // RFC 9457 `type`, a URI reference; without one the problem is `about:blank`
  type?: string;
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
} & {
  readonly schema: BodySchema;
  readonly problemSchema: ProblemSchema;
  readonly openapi: (options?: { format?: ErrorFormat }) => OpenApiComponents;
};

// catalog keys taken by the catalog's own members
const reserved = ["schema", "problemSchema", "openapi"] as const;
type Reserved = { [K in (typeof reserved)[number]]?: never };

function errorClass(name: string, spec: ErrorSpec) {
  // with a list and no statusCode passed (JS callers), the first one wins
  const defaultStatus =
    typeof spec.statusCode === "number" ? spec.statusCode : spec.statusCode[0];
  const defaultMessage = spec.message ?? name;
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
          type: spec.type,
          statusCode: props.statusCode ?? defaultStatus,
          message: props.message ?? defaultMessage,
          title: defaultMessage,
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
 * - `toProblem()`: the same error as an RFC 9457 problem, `{ type?, title, status, detail?, code? }`; its `detail` is the public `message` of this occurrence, never the internal `detail`.
 * - `toString()`: one line of JSON for logs, with `code`, `message`, `statusCode` and `detail`, plus `stack` for a 5xx whose `detail` is not an `Error`.
 * - `fromIssues(message, issues)`: an error from validation issues (Standard Schema shape).
 *
 * The catalog also has `schema` (the JSON Schema of the `toJSON()` body), `problemSchema` (the one of `toProblem()`)
 * and `openapi()` (OpenAPI components for both), so the keys `schema`, `problemSchema` and `openapi` are reserved.
 *
 * @param specs One entry per error:
 * - `statusCode`: required. A list (`[503, 504]`) makes the constructor require one of them.
 * - `code`: optional business code. Without it, the body is `{ message }`.
 * - `message`: optional default message. Without it, the key is the message. It is the `title` of the problem.
 * - `type`: optional RFC 9457 `type`, a URI reference. Without it, the problem has no `type` (`about:blank`).
 * @returns One class per key, plus `schema`, `problemSchema` and `openapi`.
 * @throws {TypeError} When a key is named `schema`, `problemSchema` or `openapi`.
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
 * @example RFC 9457 problem details
 * ```ts
 * const { NotFoundError } = defineErrors({
 *   NotFoundError: {
 *     statusCode: 404,
 *     code: "0.4.0",
 *     message: "Not Found",
 *     type: "https://example.com/problems/not-found",
 *   },
 * });
 *
 * new NotFoundError({ message: "Conversation not found" }).toProblem();
 * // {
 * //   type: "https://example.com/problems/not-found",
 * //   title: "Not Found",
 * //   status: 404,
 * //   detail: "Conversation not found",
 * //   code: "0.4.0",
 * // }
 * ```
 *
 * @example OpenAPI
 * ```ts
 * const errors = defineErrors({
 *   NotFoundError: { statusCode: 404, code: "0.4.0", message: "Not Found" },
 * });
 *
 * const document = {
 *   openapi: "3.1.0",
 *   info: { title: "API", version: "1.0.0" },
 *   paths: {
 *     "/users/{id}": {
 *       get: {
 *         responses: {
 *           "404": { $ref: "#/components/responses/NotFoundError" },
 *         },
 *       },
 *     },
 *   },
 *   // schemas.ErrorBody and responses.NotFoundError
 *   components: errors.openapi(),
 *   // for toProblem() bodies: errors.openapi({ format: "problem" })
 * };
 * ```
 */
export function defineErrors<const T extends Specs>(
  specs: T & Reserved,
): Catalog<T> {
  for (const key of reserved) {
    if (key in specs) {
      throw new TypeError(`error key "${key}" is reserved for errors.${key}`);
    }
  }
  const entries = Object.entries(specs as Specs);
  const codes = entries.map(([, spec]) => spec.code);
  const schemas = {
    json: bodySchema(codes),
    problem: problemSchema(
      codes,
      entries.flatMap(([, spec]) => spec.statusCode),
    ),
  };
  const classes = entries.map(
    ([name, spec]) => [name, errorClass(name, spec)] as const,
  );
  return {
    schema: schemas.json,
    problemSchema: schemas.problem,
    openapi: ({ format = "json" }: { format?: ErrorFormat } = {}) =>
      openApiComponents(
        schemas,
        // a list of statuses answers its first one, as in the constructor without statusCode
        Object.fromEntries(classes.map(([name, Class]) => [name, new Class()])),
        format,
      ),
    ...Object.fromEntries(classes),
  } as unknown as Catalog<T>;
}
