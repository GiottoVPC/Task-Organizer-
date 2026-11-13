"use strict";

const STORAGE_KEY = "task-organizer.tasks.v1";
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

function loadTasks() {
  const savedTasks = localStorage.getItem(STORAGE_KEY);
  if (savedTasks === null) return [];

  const parsedTasks = JSON.parse(savedTasks);
  if (!Array.isArray(parsedTasks) || !parsedTasks.every(isTask)) {
    throw new Error("Saved task data has an unexpected format.");
  }
  return parsedTasks;
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    storageMessage.hidden = true;
    storageMessage.textContent = "";
    return true;
  } catch (error) {
    storageMessage.textContent = "Your changes could not be saved in this browser. Check your browser storage settings and try again.";
    storageMessage.hidden = false;
    console.error("Unable to save task data:", error);
    return false;
  }
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    showFormError("Enter a task name before saving.");
    titleInput.focus();
    return;
  }

  if (editingTaskId) {
    const task = tasks.find((item) => item.id === editingTaskId);
    if (!task) {
      showFormError("This task is no longer available. Refresh the list and try again.");
      return;
    }
    task.title = title;
    task.description = descriptionInput.value.trim();
    task.dueDate = dueDateInput.value;
    task.priority = priorityInput.value;
  } else {
    tasks.unshift({
      id: crypto.randomUUID(),
      title,
      description: descriptionInput.value.trim(),
      dueDate: dueDateInput.value,
      priority: priorityInput.value,
      completed: false,
      createdAt: new Date().toISOString()
    });
  }

  saveTasks();
  resetForm();
  render();
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

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const task = tasks.find((item) => item.id === button.dataset.id);
  if (!task) return;

  if (button.dataset.action === "edit") {
    beginEdit(task);
  } else if (button.dataset.action === "delete") {
    tasks = tasks.filter((item) => item.id !== task.id);
    if (editingTaskId === task.id) resetForm();
    saveTasks();
    render();
  }
});

taskList.addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;

  const task = tasks.find((item) => item.id === checkbox.dataset.id);
  if (!task) return;
  task.completed = checkbox.checked;
  saveTasks();
  render();
});

clearCompletedButton.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
});

try {
  tasks = loadTasks();
} catch (error) {
  storageMessage.textContent = "Saved task data could not be read. New tasks can still be added, but saving them will replace the unread data.";
  storageMessage.hidden = false;
  console.error("Unable to read task data:", error);
}
render();
