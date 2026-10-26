import assert from "node:assert/strict";
import { describe, test } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import { errorHandler } from "../../src/adapters/fastify.js";
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

// the routes the test registers, the error handler set before them, on a real port
async function serve(
  routes: (app: FastifyInstance) => void,
  {
    logged = [] as CatalogError[],
    format = undefined as ErrorFormat | undefined,
  } = {},
) {
  const app = Fastify();
  app.setErrorHandler(
    errorHandler({
      fallback: (err) => new InternalError({ detail: err }),
      log: (error) => logged.push(error),
      format,
    }),
  );
  routes(app);
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  return { url, close: () => app.close() };
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
    await server.close();

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
    await server.close();

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      code: "0.5.0",
      message: "Internal Server Error",
    });
    assert.ok(logged[0] instanceof InternalError);
    assert.equal(logged[0].detail, cause);
  });

  test("an error Fastify raises itself, like an invalid JSON body, reaches fallback", async () => {
    const logged: CatalogError[] = [];
    const server = await serve((app) => app.post("/", async () => "ok"), {
      logged,
    });
    const res = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    await server.close();

    assert.equal(res.status, 500);
    assert.ok(logged[0] instanceof InternalError);
    assert.equal((logged[0].detail as { statusCode: number }).statusCode, 400);
  });

  test("raw headers sent on text/event-stream end with an event: error line and close", async () => {
    const server = await serve((app) =>
      app.get("/", async (_req, reply) => {
        reply.raw.setHeader("content-type", "text/event-stream");
        reply.raw.write("data: 1\n\n");
        throw new BadRequestError({ message: "x" });
      }),
    );
    const res = await fetch(server.url);
    const text = await res.text();
    await server.close();

    assert.equal(res.status, 200);
    assert.equal(
      text,
      'data: 1\n\nevent: error\ndata: {"code":"0.1.0","message":"x"}\n\n',
    );
  });

  test("raw headers sent on any other content type close without a body event", async () => {
    const server = await serve((app) =>
      app.get("/", async (_req, reply) => {
        reply.raw.setHeader("content-type", "text/plain");
        reply.raw.write("partial");
        throw new BadRequestError({ message: "x" });
      }),
    );
    const res = await fetch(server.url);
    const text = await res.text();
    await server.close();

    assert.equal(text, "partial");
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
    await server.close();

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

describe("client disconnect", () => {
  test("a client that closed the connection is logged and never written to", async () => {
    const started = deferred<void>();
    const logged = deferred<CatalogError>();
    let answered = false;

    const app = Fastify();
    app.addHook("onSend", async () => {
      answered = true;
    });
    app.setErrorHandler(
      errorHandler({
        fallback: (err) => new InternalError({ detail: err }),
        log: (error) => logged.resolve(error),
      }),
    );
    const closed = deferred<void>();
    app.get("/", async (req) => {
      req.raw.socket.once("close", () => closed.resolve());
      started.resolve();
      // the error is thrown after the socket is gone
      await closed.promise;
      throw new BadRequestError({ message: "late" });
    });
    const url = await app.listen({ port: 0, host: "127.0.0.1" });

    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).catch(() => {});
    await started.promise;
    controller.abort();
    const error = await logged.promise;
    await app.close();

    assert.ok(error instanceof BadRequestError);
    assert.equal(answered, false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
