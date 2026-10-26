import assert from "node:assert/strict";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { describe, mock, test } from "node:test";

import express, { RequestHandler } from "express";

import { errorHandler } from "../../src/adapters/express.js";
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

// one GET / route, the error handler after it, on a real port
async function serve(
  handler: RequestHandler,
  logged: CatalogError[] = [],
  format?: ErrorFormat,
) {
  const app = express();
  app.get("/", handler);
  app.use(
    errorHandler({
      fallback: (err) => new InternalError({ detail: err }),
      log: (error) => logged.push(error),
      format,
    }),
  );
  const server = app.listen(0);
  await once(server, "listening");
  const url = `http://localhost:${(server.address() as AddressInfo).port}/`;
  return {
    url,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

describe("error responses", () => {
  test("a CatalogError answers its statusCode and toJSON, and is logged", async () => {
    const logged: CatalogError[] = [];
    const server = await serve(async () => {
      throw new BadRequestError({ message: "invalid", detail: "why" });
    }, logged);
    const res = await fetch(server.url);
    server.close();

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { code: "0.1.0", message: "invalid" });
    assert.equal(logged.length, 1);
    assert.ok(logged[0] instanceof BadRequestError);
  });

  test("any other error goes through fallback, and the fallback error is logged", async () => {
    const cause = new Error("db down");
    const logged: CatalogError[] = [];
    const server = await serve(() => {
      throw cause;
    }, logged);
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

  test("headers sent on text/event-stream end with an event: error line and close", async () => {
    const server = await serve(async (_req, res) => {
      res.setHeader("content-type", "text/event-stream");
      res.write("data: 1\n\n");
      throw new BadRequestError({ message: "x" });
    });
    const res = await fetch(server.url);
    const text = await res.text();
    server.close();

    assert.equal(res.status, 200);
    assert.equal(
      text,
      'data: 1\n\nevent: error\ndata: {"code":"0.1.0","message":"x"}\n\n',
    );
  });

  test("headers sent on any other content type close without a body event", async () => {
    const server = await serve(async (_req, res) => {
      res.setHeader("content-type", "text/plain");
      res.write("partial");
      throw new BadRequestError({ message: "x" });
    });
    const res = await fetch(server.url);
    const text = await res.text();
    server.close();

    assert.equal(text, "partial");
  });
});

describe("problem format", () => {
  test("answers toProblem as application/problem+json", async () => {
    const server = await serve(
      async () => {
        throw new BadRequestError({ message: "invalid", detail: "why" });
      },
      [],
      "problem",
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

  test("the default format stays application/json", async () => {
    const server = await serve(async () => {
      throw new BadRequestError();
    });
    const res = await fetch(server.url);
    server.close();

    assert.match(res.headers.get("content-type")!, /^application\/json/);
  });

  test("an event: error line carries the problem", async () => {
    const server = await serve(
      async (_req, res) => {
        res.setHeader("content-type", "text/event-stream");
        res.write("data: 1\n\n");
        throw new BadRequestError({ message: "x" });
      },
      [],
      "problem",
    );
    const res = await fetch(server.url);
    const text = await res.text();
    server.close();

    assert.equal(
      text,
      'data: 1\n\nevent: error\ndata: {"title":"Bad Request Error","status":400,"detail":"x","code":"0.1.0"}\n\n',
    );
  });
});

describe("client disconnect", () => {
  test("a client that closed the connection is logged and never written to", async () => {
    const started = deferred<void>();
    const closed = deferred<void>();
    const logged = deferred<CatalogError>();
    let writes = 0;

    const app = express();
    // count any attempt to answer on this response
    app.use((_req, res, next) => {
      for (const name of ["status", "json", "end", "write"] as const) {
        mock.method(res, name, () => {
          writes++;
          return res;
        });
      }
      next();
    });
    app.get("/", async (_req, res) => {
      res.once("close", () => closed.resolve());
      started.resolve();
      // the error is thrown after the socket is gone
      await closed.promise;
      throw new BadRequestError({ message: "late" });
    });
    app.use(
      errorHandler({
        fallback: (err) => new InternalError({ detail: err }),
        log: (error) => logged.resolve(error),
      }),
    );
    const server = app.listen(0);
    await once(server, "listening");
    const url = `http://localhost:${(server.address() as AddressInfo).port}/`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).catch(() => {});
    await started.promise;
    controller.abort();
    const error = await logged.promise;
    server.closeAllConnections();
    server.close();

    assert.ok(error instanceof BadRequestError);
    assert.equal(writes, 0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
