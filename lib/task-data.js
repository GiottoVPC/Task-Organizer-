export class TaskValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaskValidationError";
    this.statusCode = 400;
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super("Task not found.");
    this.name = "TaskNotFoundError";
    this.statusCode = 404;
  }
}

const priorities = new Set(["low", "medium", "high"]);
const taskFields = new Set(["title", "description", "dueDate", "priority", "completed"]);

function isValidDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function validateTaskInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TaskValidationError("Request body must be a JSON object.");
  }

  for (const field of Object.keys(input)) {
    if (!taskFields.has(field)) {
      throw new TaskValidationError(`Unknown task field: ${field}.`);
    }
  }

  if (!partial && (typeof input.title !== "string" || !input.title.trim())) {
    throw new TaskValidationError("Task title is required.");
  }

  if (partial && Object.keys(input).length === 0) {
    throw new TaskValidationError("Provide at least one task field to update.");
  }

  const task = {};
  if ("title" in input) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 120) {
      throw new TaskValidationError("Task title must contain 1 to 120 characters.");
    }
    task.title = input.title.trim();
  }
  if ("description" in input) {
    if (typeof input.description !== "string" || input.description.length > 500) {
      throw new TaskValidationError("Task details must be 500 characters or fewer.");
    }
    task.description = input.description.trim();
  } else if (!partial) {
    task.description = "";
  }
  if ("dueDate" in input) {
    if (typeof input.dueDate !== "string" || !isValidDate(input.dueDate)) {
      throw new TaskValidationError("Due date must be a valid YYYY-MM-DD date or empty.");
    }
    task.dueDate = input.dueDate;
  } else if (!partial) {
    task.dueDate = "";
  }
  if ("priority" in input) {
    if (!priorities.has(input.priority)) {
      throw new TaskValidationError("Priority must be low, medium, or high.");
    }
    task.priority = input.priority;
  } else if (!partial) {
    task.priority = "medium";
  }
  if ("completed" in input) {
    if (typeof input.completed !== "boolean") {
      throw new TaskValidationError("Completed must be true or false.");
    }
    task.completed = input.completed;
  }

  return task;
}

export function validateTaskDatabase(tasks) {
  if (!Array.isArray(tasks)) {
    throw new Error("Task database must contain a JSON array.");
  }
  for (const task of tasks) {
    if (!task
      || typeof task.id !== "string"
      || typeof task.title !== "string"
      || typeof task.description !== "string"
      || typeof task.dueDate !== "string"
      || !priorities.has(task.priority)
      || typeof task.completed !== "boolean"
      || typeof task.createdAt !== "string") {
      throw new Error("Task database contains an invalid task.");
    }
  }
  return tasks;
}
