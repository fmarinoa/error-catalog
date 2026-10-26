import type { CatalogError } from "./CatalogError.js";
import { type ErrorFormat, bodyOf, mediaType } from "./format.js";
import type { BodySchema, ProblemSchema } from "./schema.js";

export interface OpenApiResponse {
  description: string;
  content: Record<string, { schema: { $ref: string }; example: object }>;
}

/** The `components` of an OpenAPI 3.x document: the body schema and one response per error. */
export interface OpenApiComponents {
  schemas: Record<string, BodySchema | ProblemSchema>;
  responses: Record<string, OpenApiResponse>;
}

const schemaName = { json: "ErrorBody", problem: "ProblemDetails" } as const;

// one response per error class, each pointing at the one shared body schema
export function openApiComponents(
  schemas: { json: BodySchema; problem: ProblemSchema },
  errors: Record<string, CatalogError>,
  format: ErrorFormat,
): OpenApiComponents {
  const name = schemaName[format];
  return {
    schemas: { [name]: schemas[format] },
    responses: Object.fromEntries(
      Object.entries(errors).map(([key, error]) => [
        key,
        {
          description: error.title,
          content: {
            [mediaType[format]]: {
              schema: { $ref: `#/components/schemas/${name}` },
              example: bodyOf(error, format),
            },
          },
        },
      ]),
    ),
  };
}
