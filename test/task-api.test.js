import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createServer } from "../servers/index.js";

let directory;
let databasePath;
let server;
let baseUrl;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "task-organizer-"));
  databasePath = join(directory, "database.json");
  await writeFile(databasePath, "[]\n");
  server = createServer({ databasePath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await rm(directory, { recursive: true, force: true });
});

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

test("task API supports create, read, update, completion, and delete", async () => {
  const homepage = await fetch(baseUrl);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /Task organizer/);

  const created = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Write tests",
      description: "Cover the API",
      priority: "high"
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.task.title, "Write tests");
  assert.equal(created.body.task.completed, false);

  const id = created.body.task.id;
  const fetched = await request(`/api/tasks/${id}`);
  assert.equal(fetched.response.status, 200);
  assert.equal(fetched.body.task.description, "Cover the API");

  const updated = await request(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Ship tests", completed: true })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.task.title, "Ship tests");
  assert.equal(updated.body.task.completed, true);

  const listed = await request("/api/tasks");
  assert.equal(listed.body.tasks.length, 1);
  assert.equal(listed.body.tasks[0].id, id);

  const deleted = await request(`/api/tasks/${id}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 200);
  assert.deepEqual(deleted.body, { deleted: true });

  const missing = await request(`/api/tasks/${id}`);
  assert.equal(missing.response.status, 404);
});

test("task API validates input and serializes concurrent writes", async () => {
  const invalid = await request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "   " })
  });
  assert.equal(invalid.response.status, 400);

  const creates = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    request("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Task ${index}` })
    })
  ));
  assert.ok(creates.every(({ response }) => response.status === 201));

  const listed = await request("/api/tasks");
  assert.equal(listed.body.tasks.length, 10);
  const persisted = JSON.parse(await readFile(databasePath, "utf8"));
  assert.equal(persisted.length, 10);

  const completed = await request(`/api/tasks/${creates[0].body.task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: true })
  });
  assert.equal(completed.body.task.completed, true);

  const cleared = await request("/api/tasks?completed=true", { method: "DELETE" });
  assert.deepEqual(cleared.body, { deleted: 1 });
  const afterClear = await request("/api/tasks");
  assert.equal(afterClear.body.tasks.length, 9);
});
