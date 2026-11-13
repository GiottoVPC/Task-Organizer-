"use strict";

const priorities = new Set(["low", "medium", "high"]);

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const dueDateInput = document.querySelector("#task-due-date");
const priorityInput = document.querySelector("#task-priority");
const formHeading = document.querySelector("#form-heading");
const submitButton = document.querySelector("#submit-task");
const cancelButton = document.querySelector("#cancel-edit");
const formError = document.querySelector("#form-error");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyDescription = document.querySelector("#empty-description");
const searchInput = document.querySelector("#task-search");
const filterButtons = document.querySelectorAll(".filter-button");
const clearCompletedButton = document.querySelector("#clear-completed");
const storageMessage = document.querySelector("#storage-message");

let tasks = [];
let currentFilter = "all";
let editingTaskId = null;

document.querySelector("#today-date").textContent = new Intl.DateTimeFormat(
  undefined,
  { weekday: "short", month: "short", day: "numeric" }
).format(new Date());

function isTask(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.dueDate === "string"
    && priorities.has(value.priority)
    && typeof value.completed === "boolean"
    && typeof value.createdAt === "string";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result;
}

function showStorageMessage(message) {
  storageMessage.textContent = message;
  storageMessage.hidden = !message;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDueDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function matchesCurrentView(task, query) {
  const matchesFilter = currentFilter === "all"
    || (currentFilter === "active" && !task.completed)
    || (currentFilter === "completed" && task.completed);
  const searchableText = `${task.title} ${task.description}`.toLocaleLowerCase();
  return matchesFilter && searchableText.includes(query);
}

function renderTask(task) {
  const item = makeElement("li", `task-card${task.completed ? " is-completed" : ""}`);
  const top = makeElement("div", "task-card-top");
  const checkbox = makeElement("input", "task-checkbox");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Mark "${task.title}" ${task.completed ? "incomplete" : "complete"}`);
  checkbox.dataset.action = "toggle";
  checkbox.dataset.id = task.id;

  const main = makeElement("div", "task-main");
  main.append(makeElement("p", "task-title", task.title));
  if (task.description) {
    main.append(makeElement("p", "task-description", task.description));
  }
  top.append(checkbox, main);

  const bottom = makeElement("div", "task-card-bottom");
  const metadata = makeElement("div", "task-meta");
  const priority = makeElement(
    "span",
    `priority-badge priority-${task.priority}`,
    `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`
  );
  metadata.append(priority);
  if (task.dueDate) metadata.append(makeElement("span", "", `Due ${formatDueDate(task.dueDate)}`));

  const actions = makeElement("div", "task-actions");
  const editButton = makeElement("button", "task-action", "Edit");
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.dataset.id = task.id;
  editButton.setAttribute("aria-label", `Edit "${task.title}"`);

  const deleteButton = makeElement("button", "task-action delete", "Delete");
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = task.id;
  deleteButton.setAttribute("aria-label", `Delete "${task.title}"`);
  actions.append(editButton, deleteButton);
  bottom.append(metadata, actions);
  item.append(top, bottom);
  return item;
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleTasks = tasks.filter((task) => matchesCurrentView(task, query));

  taskList.replaceChildren(...visibleTasks.map(renderTask));
  document.querySelector("#total-count").textContent = tasks.length;
  document.querySelector("#active-count").textContent = tasks.filter((task) => !task.completed).length;
  document.querySelector("#completed-count").textContent = tasks.filter((task) => task.completed).length;
  clearCompletedButton.hidden = !tasks.some((task) => task.completed);
  emptyState.hidden = visibleTasks.length > 0;

  if (tasks.length === 0) {
    emptyTitle.textContent = "Nothing on your list yet";
    emptyDescription.textContent = "Add your first task to get started.";
  } else if (visibleTasks.length === 0) {
    emptyTitle.textContent = "No matching tasks";
    emptyDescription.textContent = "Try another search or filter.";
  }
}

function resetForm() {
  form.reset();
  priorityInput.value = "medium";
  editingTaskId = null;
  formHeading.textContent = "Add a task";
  submitButton.textContent = "Add task";
  cancelButton.hidden = true;
  showFormError("");
}

function beginEdit(task) {
  editingTaskId = task.id;
  titleInput.value = task.title;
  descriptionInput.value = task.description;
  dueDateInput.value = task.dueDate;
  priorityInput.value = task.priority;
  formHeading.textContent = "Edit task";
  submitButton.textContent = "Save changes";
  cancelButton.hidden = false;
  showFormError("");
  titleInput.focus();
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    showFormError("Enter a task name before saving.");
    titleInput.focus();
    return;
  }

  const taskFields = {
    title,
    description: descriptionInput.value.trim(),
    dueDate: dueDateInput.value,
    priority: priorityInput.value
  };
  const wasEditing = Boolean(editingTaskId);
  const taskId = editingTaskId;
  submitButton.disabled = true;
  try {
    const result = await apiRequest(
      wasEditing ? `/api/tasks/${encodeURIComponent(taskId)}` : "/api/tasks",
      {
        method: wasEditing ? "PATCH" : "POST",
        body: JSON.stringify(taskFields)
      }
    );
    if (!isTask(result.task)) throw new Error("The API returned an invalid task.");
    if (wasEditing) {
      tasks = tasks.map((task) => task.id === taskId ? result.task : task);
    } else {
      tasks.unshift(result.task);
    }
    showStorageMessage("");
    resetForm();
    render();
  } catch (error) {
    showFormError(error.message);
    console.error("Unable to save task:", error);
  } finally {
    submitButton.disabled = false;
  }
});

cancelButton.addEventListener("click", resetForm);
searchInput.addEventListener("input", render);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("is-selected", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

taskList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const task = tasks.find((item) => item.id === button.dataset.id);
  if (!task) return;

  if (button.dataset.action === "edit") {
    beginEdit(task);
  } else if (button.dataset.action === "delete") {
    button.disabled = true;
    try {
      await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      tasks = tasks.filter((item) => item.id !== task.id);
      if (editingTaskId === task.id) resetForm();
      showStorageMessage("");
      render();
    } catch (error) {
      showStorageMessage(error.message);
      console.error("Unable to delete task:", error);
    } finally {
      button.disabled = false;
    }
  }
});

taskList.addEventListener("change", async (event) => {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;

  const task = tasks.find((item) => item.id === checkbox.dataset.id);
  if (!task) return;
  checkbox.disabled = true;
  try {
    const result = await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: checkbox.checked })
    });
    if (!isTask(result.task)) throw new Error("The API returned an invalid task.");
    tasks = tasks.map((item) => item.id === task.id ? result.task : item);
    showStorageMessage("");
    render();
  } catch (error) {
    checkbox.checked = task.completed;
    checkbox.disabled = false;
    showStorageMessage(error.message);
    console.error("Unable to update task completion:", error);
  }
});

clearCompletedButton.addEventListener("click", async () => {
  clearCompletedButton.disabled = true;
  try {
    await apiRequest("/api/tasks?completed=true", { method: "DELETE" });
    tasks = tasks.filter((task) => !task.completed);
    showStorageMessage("");
    render();
  } catch (error) {
    showStorageMessage(error.message);
    console.error("Unable to clear completed tasks:", error);
  } finally {
    clearCompletedButton.disabled = false;
  }
});

async function initialize() {
  try {
    const result = await apiRequest("/api/tasks");
    if (!Array.isArray(result.tasks) || !result.tasks.every(isTask)) {
      throw new Error("The API returned an invalid task list.");
    }
    tasks = result.tasks;
  } catch (error) {
    showStorageMessage(`Could not load tasks from the API: ${error.message}`);
    console.error("Unable to load tasks:", error);
  }
  render();
}

initialize();
