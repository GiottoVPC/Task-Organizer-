import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  TaskNotFoundError,
  validateTaskDatabase,
  validateTaskInput
} from "../lib/task-data.js";

export function createTaskStore(databasePath) {
  let mutationQueue = Promise.resolve();

  async function readTasks() {
    let contents;
    try {
      contents = await readFile(databasePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return validateTaskDatabase(JSON.parse(contents));
  }

  async function writeTasks(tasks) {
    const temporaryPath = `${databasePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(tasks, null, 2)}\n`, { flag: "wx" });
      await rename(temporaryPath, databasePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  function mutate(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    list: readTasks,

    async get(id) {
      const tasks = await readTasks();
      const task = tasks.find((item) => item.id === id);
      if (!task) throw new TaskNotFoundError();
      return task;
    },

    create(input) {
      const fields = validateTaskInput(input);
      return mutate(async () => {
        const tasks = await readTasks();
        const task = {
          id: randomUUID(),
          ...fields,
          completed: fields.completed ?? false,
          createdAt: new Date().toISOString()
        };
        tasks.unshift(task);
        await writeTasks(tasks);
        return task;
      });
    },

    update(id, input) {
      const fields = validateTaskInput(input, { partial: true });
      return mutate(async () => {
        const tasks = await readTasks();
        const index = tasks.findIndex((item) => item.id === id);
        if (index === -1) throw new TaskNotFoundError();
        tasks[index] = { ...tasks[index], ...fields };
        await writeTasks(tasks);
        return tasks[index];
      });
    },

    remove(id) {
      return mutate(async () => {
        const tasks = await readTasks();
        const remaining = tasks.filter((item) => item.id !== id);
        if (remaining.length === tasks.length) throw new TaskNotFoundError();
        await writeTasks(remaining);
      });
    },

    clearCompleted() {
      return mutate(async () => {
        const tasks = await readTasks();
        const remaining = tasks.filter((item) => !item.completed);
        await writeTasks(remaining);
        return tasks.length - remaining.length;
      });
    }
  };
}
