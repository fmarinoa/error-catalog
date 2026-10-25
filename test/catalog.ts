import { defineErrors } from "../src/index.js";

// the catalog the core tests share: one status, a list of statuses, a status no one sends
export const errors = defineErrors({
  BadRequestError: {
    statusCode: 400,
    code: "0.1.0",
    message: "Bad Request Error",
  },
  UpstreamError: {
    statusCode: [503, 504],
    code: "0.2.0",
    message: "LLM provider unavailable",
  },
  ClientClosedError: {
    statusCode: 499,
    code: "0.3.0",
    message: "Client closed request",
  },
});
