export interface BodySchema {
  type: "object";
  properties: {
    code?: { type: "string"; enum: string[] };
    message: { type: "string" };
  };
  required: ("code" | "message")[];
  additionalProperties: false;
}

// one code per error, undefined for an error without one
export function bodySchema(codes: readonly (string | undefined)[]): BodySchema {
  const defined = codes.filter((code) => code !== undefined);
  if (!defined.length) {
    return {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      code: { type: "string", enum: defined },
      message: { type: "string" },
    },
    // required only when every error has one
    required:
      defined.length === codes.length ? ["code", "message"] : ["message"],
    additionalProperties: false,
  };
}

export interface ProblemSchema {
  type: "object";
  properties: {
    type: { type: "string"; format: "uri-reference" };
    title: { type: "string" };
    status: { type: "integer"; enum: number[] };
    detail: { type: "string" };
    code?: { type: "string"; enum: string[] };
  };
  required: ("title" | "status" | "code")[];
  additionalProperties: false;
}

// one code and one list of statuses per error, undefined code for an error without one
export function problemSchema(
  codes: readonly (string | undefined)[],
  statuses: readonly number[],
): ProblemSchema {
  const defined = codes.filter((code) => code !== undefined);
  return {
    type: "object",
    properties: {
      type: { type: "string", format: "uri-reference" },
      title: { type: "string" },
      status: {
        type: "integer",
        enum: [...new Set(statuses)].sort((a, b) => a - b),
      },
      detail: { type: "string" },
      // like the body schema: absent when no error has a code
      ...(defined.length > 0 && { code: { type: "string", enum: defined } }),
    },
    required: [
      "title",
      "status",
      ...(defined.length > 0 && defined.length === codes.length
        ? (["code"] as const)
        : []),
    ],
    additionalProperties: false,
  };
}
