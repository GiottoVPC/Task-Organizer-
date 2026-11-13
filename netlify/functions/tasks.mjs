import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import seedTasks from "../../database.json" with { type: "json" };
import {
  TaskNotFoundError,
  validateTaskDatabase,
  validateTaskInput
} from "../../lib/task-data.js";

const databaseKey = "database.json";
const maximumBodySize = 64 * 1024;

class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readDatabase(store) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await store.getWithMetadata(databaseKey, {
      type: "json",
      consistency: "strong"
    });
    if (entry) {
      return {
        tasks: validateTaskDatabase(entry.data),
        etag: entry.etag
      };
    }

    const initialized = await store.setJSON(databaseKey, seedTasks, { onlyIfNew: true });
    if (initialized.modified) continue;
  }
  throw new HttpError("Could not initialize the task database. Try again.", 503);
}

async function mutateDatabase(store, change) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await readDatabase(store);
    const { tasks, result } = change([...current.tasks]);
    const write = await store.setJSON(databaseKey, tasks, { onlyIfMatch: current.etag });
    if (write.modified) return result;
  }
  throw new HttpError("The task list changed repeatedly. Try again.", 503);
}

async function readJsonBody(request) {
  if (!request.body) throw new HttpError("Request body must be valid JSON.", 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBodySize) {
      await reader.cancel();
      throw new HttpError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

function jsonResponse(data, statusCode = 200) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function taskIdFromRequest(url) {
  const match = url.pathname.match(
    /^(?:\/api\/tasks|\/\.netlify\/functions\/tasks)\/([^/]+)\/?$/
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new HttpError("Invalid task ID.", 400);
  }
}

export default async function tasksHandler(request) {
  try {
    const url = new URL(request.url);
    const taskId = taskIdFromRequest(url);
    const store = getStore("task-organizer");

    if (taskId === null && (url.pathname === "/api/tasks" || url.pathname === "/.netlify/functions/tasks")) {
      if (request.method === "GET") {
        const { tasks } = await readDatabase(store);
        return jsonResponse({ tasks });
      }
      if (request.method === "POST") {
        const fields = validateTaskInput(await readJsonBody(request));
        const task = {
          id: randomUUID(),
          ...fields,
          completed: fields.completed ?? false,
          createdAt: new Date().toISOString()
        };
        await mutateDatabase(store, (tasks) => {
          tasks.unshift(task);
          return { tasks, result: task };
        });
        return jsonResponse({ task }, 201);
      }
      if (request.method === "DELETE" && url.searchParams.get("completed") === "true") {
        const deleted = await mutateDatabase(store, (tasks) => {
          const remaining = tasks.filter((task) => !task.completed);
          return { tasks: remaining, result: tasks.length - remaining.length };
        });
        return jsonResponse({ deleted });
      }
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (taskId !== null) {
      if (request.method === "GET") {
        const { tasks } = await readDatabase(store);
        const task = tasks.find((item) => item.id === taskId);
        if (!task) throw new TaskNotFoundError();
        return jsonResponse({ task });
      }
      if (request.method === "PATCH") {
        const fields = validateTaskInput(await readJsonBody(request), { partial: true });
        const task = await mutateDatabase(store, (tasks) => {
          const index = tasks.findIndex((item) => item.id === taskId);
          if (index === -1) throw new TaskNotFoundError();
          tasks[index] = { ...tasks[index], ...fields };
          return { tasks, result: tasks[index] };
        });
        return jsonResponse({ task });
      }
      if (request.method === "DELETE") {
        await mutateDatabase(store, (tasks) => {
          const remaining = tasks.filter((item) => item.id !== taskId);
          if (remaining.length === tasks.length) throw new TaskNotFoundError();
          return { tasks: remaining, result: true };
        });
        return jsonResponse({ deleted: true });
      }
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    const statusCode = error instanceof TaskNotFoundError
      ? error.statusCode
      : error.statusCode ?? 500;
    if (statusCode >= 500) console.error("Task API request failed:", error);
    return jsonResponse({
      error: statusCode >= 500 ? "Internal server error." : error.message
    }, statusCode);
  }
}
