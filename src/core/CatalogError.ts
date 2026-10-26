import { inspect } from "node:util";

// RFC 9457 problem details, with the business code as an extension member
export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
}

export class CatalogError<N extends number = number> extends Error {
  readonly code: string | undefined;
  readonly statusCode: N;
  readonly detail: unknown;
  readonly type: string | undefined;
  readonly title: string;

  constructor({
    name,
    code,
    statusCode,
    message,
    detail,
    type,
    title = message,
  }: {
    name: string;
    code?: string;
    statusCode: N;
    message: string;
    detail?: unknown;
    type?: string;
    // the spec's default message: it names the kind of error, `message` this occurrence
    title?: string;
  }) {
    super(message);
    this.name = name;
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
    this.type = type;
    this.title = title;
  }

  // the body a client sees: nothing about detail, statusCode or stack; no code key without a code
  toJSON(): { code?: string; message: string } {
    return this.code === undefined
      ? { message: this.message }
      : { code: this.code, message: this.message };
  }

  // RFC 9457 body; its `detail` is the public message of this occurrence, never this.detail
  toProblem(): ProblemDetails {
    const { type, title, statusCode, message, code } = this;
    return {
      ...(type !== undefined && { type }),
      title,
      status: statusCode,
      ...(message !== title && { detail: message }),
      ...(code !== undefined && { code }),
    };
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
