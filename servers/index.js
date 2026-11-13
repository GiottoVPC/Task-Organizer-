import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TaskNotFoundError } from "../lib/task-data.js";
import { createTaskStore } from "./task-store.js";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);
const maximumBodySize = 64 * 1024;

class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodySize) throw new HttpError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError("Not found.", 404);
  }

  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(projectRoot, `.${relativePath}`);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
    throw new HttpError("Not found.", 404);
  }

  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new HttpError("Not found.", 404);
    }
    throw error;
  }
  if (!fileInfo.isFile()) throw new HttpError("Not found.", 404);

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "content-length": fileInfo.size
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function createServer({ databasePath = resolve(projectRoot, "database.json") } = {}) {
  const taskStore = createTaskStore(databasePath);

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new HttpError("Invalid URL.", 400);
      }
      if (pathname === "/api/tasks" || pathname === "/api/tasks/") {
        if (request.method === "GET") {
          sendJson(response, 200, { tasks: await taskStore.list() });
          return;
        }
        if (request.method === "POST") {
          const task = await taskStore.create(await readJsonBody(request));
          sendJson(response, 201, { task });
          return;
        }
        if (request.method === "DELETE" && url.searchParams.get("completed") === "true") {
          const deleted = await taskStore.clearCompleted();
          sendJson(response, 200, { deleted });
          return;
        }
        throw new HttpError("Method not allowed.", 405);
      }

      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/?$/);
      if (taskMatch) {
        const id = taskMatch[1];
        if (request.method === "GET") {
          sendJson(response, 200, { task: await taskStore.get(id) });
          return;
        }
        if (request.method === "PATCH") {
          const task = await taskStore.update(id, await readJsonBody(request));
          sendJson(response, 200, { task });
          return;
        }
        if (request.method === "DELETE") {
          await taskStore.remove(id);
          sendJson(response, 200, { deleted: true });
          return;
        }
        throw new HttpError("Method not allowed.", 405);
      }

      await serveStatic(request, response, pathname);
    } catch (error) {
      const statusCode = error instanceof TaskNotFoundError
        ? error.statusCode
        : error.statusCode ?? 500;
      if (statusCode >= 500) console.error("Request failed:", error);
      if (!response.headersSent) {
        sendJson(response, statusCode, {
          error: statusCode >= 500 ? "Internal server error." : error.message
        });
      } else {
        response.destroy(error);
      }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8888);
  const server = createServer();
  server.listen(port, () => {
    console.log(`Task Organizer running at http://localhost:${port}`);
  });
}
