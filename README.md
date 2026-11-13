# Task Organizer

A task organizer built with HTML, CSS, vanilla JavaScript, and a JSON-backed REST API.

## Run locally

Requires Node.js 20 or later.

```sh
npm install
npm start
```

Open [http://localhost:8888](http://localhost:8888). The API reads and writes tasks in `database.json`; it supports listing and reading tasks, creating them, partial updates, deleting a task, and clearing completed tasks.

## Deploy to Netlify

Import this repository as a Netlify site and use the repository root as the publish directory. `netlify.toml` configures the `netlify/functions` API and routes `/api/tasks` to it. The function initializes the persistent `task-organizer` Netlify Blobs store from `database.json`, then uses a strongly consistent JSON blob with conditional writes for updates. Netlify's function filesystem is not persistent, so deployed changes are stored in Netlify Blobs rather than attempting to rewrite the uploaded static file.

The API is unauthenticated, so all visitors to a deployed site share the same task list. Add access control before using it for private tasks.

## Tests

```sh
npm test
```