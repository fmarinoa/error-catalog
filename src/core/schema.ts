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
