import { inspect } from "node:util";

export class CatalogError<N extends number = number> extends Error {
  readonly code: string | undefined;
  readonly statusCode: N;
  readonly detail: unknown;

  constructor({
    name,
    code,
    statusCode,
    message,
    detail,
  }: {
    name: string;
    code?: string;
    statusCode: N;
    message: string;
    detail?: unknown;
  }) {
    super(message);
    this.name = name;
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }

  // the body a client sees: nothing about detail, statusCode or stack; no code key without a code
  toJSON(): { code?: string; message: string } {
    return this.code === undefined
      ? { message: this.message }
      : { code: this.code, message: this.message };
  }

  // single-line JSON, one log event per error
  toString(): string {
    const { code, message, statusCode, detail } = this;
    // where a server failure was thrown; an Error in detail already has its cause's stack, and a 4xx is no bug
    const stack =
      statusCode >= 500 && !(detail instanceof Error) ? this.stack : undefined;
    try {
      // Error props are non-enumerable, JSON.stringify would print {}
      return JSON.stringify(
        { code, message, statusCode, detail, stack },
        replaceError,
      );
    } catch {
      // circular or BigInt in detail
      return JSON.stringify({
        code,
        message,
        statusCode,
        detail: inspect(detail, { depth: null }),
        stack,
      });
    }
  }
}

const replaceError = (_: string, value: unknown) =>
  value instanceof Error
    ? { name: value.name, message: value.message, stack: value.stack }
    : value;
