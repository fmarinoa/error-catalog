import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, test } from "node:test";

import { serve as listen } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { errorHandler } from "../../src/adapters/hono.js";
import {
  CatalogError,
  type ErrorFormat,
  defineErrors,
} from "../../src/index.js";

const { BadRequestError, InternalError } = defineErrors({
  BadRequestError: {
    statusCode: 400,
    code: "0.1.0",
    message: "Bad Request Error",
  },
  InternalError: {
    statusCode: 500,
    code: "0.5.0",
    message: "Internal Server Error",
  },
});

// the routes the test registers, the error handler set on the app, on a real port
async function serve(
  routes: (app: Hono) => void,
  {
    logged = [] as CatalogError[],
    format = undefined as ErrorFormat | undefined,
  } = {},
) {
  const app = new Hono();
  routes(app);
  app.onError(
    errorHandler({
      fallback: (err) =>
        err instanceof HTTPException && err.status === 400
          ? new BadRequestError({ message: err.message })
          : new InternalError({ detail: err }),
      log: (error) => logged.push(error),
      format,
    }),
  );
  const server = listen({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  }) as Server;
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

describe("error responses", () => {
  test("a CatalogError answers its statusCode and toJSON, and is logged", async () => {
    const logged: CatalogError[] = [];
    const server = await serve(
      (app) =>
        app.get("/", async () => {
          throw new BadRequestError({ message: "invalid", detail: "why" });
        }),
      { logged },
    );
    const res = await fetch(server.url);
    server.close();

    assert.equal(res.status, 400);
    assert.match(res.headers.get("content-type")!, /^application\/json/);
    assert.deepEqual(await res.json(), { code: "0.1.0", message: "invalid" });
    assert.equal(logged.length, 1);
    assert.ok(logged[0] instanceof BadRequestError);
  });

  test("any other error goes through fallback, and the fallback error is logged", async () => {
    const cause = new Error("db down");
    const logged: CatalogError[] = [];
    const server = await serve(
      (app) =>
        app.get("/", () => {
          throw cause;
        }),
      { logged },
    );
    const res = await fetch(server.url);
    server.close();

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      code: "0.5.0",
      message: "Internal Server Error",
    });
    assert.ok(logged[0] instanceof InternalError);
    assert.equal(logged[0].detail, cause);
  });

  test("an error Hono raises itself, like an HTTPException, reaches fallback", async () => {
    const server = await serve((app) =>
      app.get("/", () => {
        throw new HTTPException(400, { message: "Malformed JSON" });
      }),
    );
    const res = await fetch(server.url);
    server.close();

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      code: "0.1.0",
      message: "Malformed JSON",
    });
  });

  test("headers set by earlier middleware survive the error answer", async () => {
    const server = await serve((app) => {
      app.use(cors({ origin: "https://example.com" }));
      app.get("/", () => {
        throw new BadRequestError();
      });
    });
    const res = await fetch(server.url, {
      headers: { origin: "https://example.com" },
    });
    server.close();

    assert.equal(res.status, 400);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "https://example.com",
    );
  });
});

describe("problem format", () => {
  test("answers toProblem as application/problem+json", async () => {
    const server = await serve(
      (app) =>
        app.get("/", async () => {
          throw new BadRequestError({ message: "invalid", detail: "why" });
        }),
      { format: "problem" },
    );
    const res = await fetch(server.url);
    server.close();

    assert.equal(res.status, 400);
    assert.match(
      res.headers.get("content-type")!,
      /^application\/problem\+json/,
    );
    assert.deepEqual(await res.json(), {
      title: "Bad Request Error",
      status: 400,
      detail: "invalid",
      code: "0.1.0",
    });
  });
});
