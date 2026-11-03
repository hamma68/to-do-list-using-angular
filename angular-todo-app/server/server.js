/**
 * Minimal REST backend for the To-Do app (Express + JSON file storage).
 *
 *   GET    /api/todos            list all todos
 *   POST   /api/todos            create   { title, priority?, dueDate? }
 *   PUT    /api/todos/:id        update   { title, priority?, dueDate? }
 *   PATCH  /api/todos/:id        toggle   { completed }
 *   DELETE /api/todos/:id        delete one
 *   DELETE /api/todos?completed=true   delete all completed
 *
 * Validation errors respond with 400 and { errors: { field: "message" } }.
 */
const express = require('express');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.API_PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');
const PRIORITIES = ['low', 'medium', 'high'];
const TITLE_MIN = 3;
const TITLE_MAX = 100;

/* ---------- storage (JSON file, writes are serialised) ---------- */
let writeQueue = Promise.resolve();

async function readTodos() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeTodos(todos) {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(todos, null, 2));
    await fs.rename(tmp, DATA_FILE);
  });
  return writeQueue;
}

/* ---------- validation ---------- */
const pad = (n) => String(n).padStart(2, '0');

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// One day of grace so users in timezones behind the server aren't rejected.
function yesterdayUtc() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function validateInput(body, existing) {
  const errors = {};
  const value = {};
  body = body && typeof body === 'object' ? body : {};

  // title
  if (typeof body.title !== 'string' || body.title.trim() === '') {
    errors.title = 'Title is required.';
  } else {
    const title = body.title.trim();
    if (title.length < TITLE_MIN) errors.title = `Title must be at least ${TITLE_MIN} characters.`;
    else if (title.length > TITLE_MAX) errors.title = `Title must be at most ${TITLE_MAX} characters.`;
    else value.title = title;
  }

  // priority
  const priority = body.priority ?? 'medium';
  if (!PRIORITIES.includes(priority)) errors.priority = 'Priority must be low, medium or high.';
  else value.priority = priority;

  // dueDate (optional)
  const due = body.dueDate === '' ? null : body.dueDate ?? null;
  if (due === null) {
    value.dueDate = null;
  } else if (typeof due !== 'string' || !isValidDate(due)) {
    errors.dueDate = 'Due date must be a valid date (YYYY-MM-DD).';
  } else if (due < yesterdayUtc() && (!existing || existing.dueDate !== due)) {
    errors.dueDate = 'Due date cannot be in the past.';
  } else {
    value.dueDate = due;
  }

  return { errors, value };
}

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: '10kb' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (_req, res) =>
  res.type('html').send('<h2>To-Do API is running ✅</h2><p>Open the <b>Angular app</b> preview (port 4200) to use it. Try <a href="/api/todos">/api/todos</a>.</p>')
);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/todos', wrap(async (_req, res) => {
  res.json(await readTodos());
}));

app.post('/api/todos', wrap(async (req, res) => {
  const { errors, value } = validateInput(req.body, null);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const todo = { id: randomUUID(), ...value, completed: false, createdAt: new Date().toISOString() };
  const todos = await readTodos();
  todos.unshift(todo);
  await writeTodos(todos);
  res.status(201).json(todo);
}));

app.put('/api/todos/:id', wrap(async (req, res) => {
  const todos = await readTodos();
  const index = todos.findIndex((t) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ errors: { id: 'Todo not found.' } });

  const { errors, value } = validateInput(req.body, todos[index]);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  todos[index] = { ...todos[index], ...value };
  await writeTodos(todos);
  res.json(todos[index]);
}));

app.patch('/api/todos/:id', wrap(async (req, res) => {
  if (typeof req.body?.completed !== 'boolean') {
    return res.status(400).json({ errors: { completed: 'completed must be true or false.' } });
  }
  const todos = await readTodos();
  const todo = todos.find((t) => t.id === req.params.id);
  if (!todo) return res.status(404).json({ errors: { id: 'Todo not found.' } });

  todo.completed = req.body.completed;
  await writeTodos(todos);
  res.json(todo);
}));

app.delete('/api/todos', wrap(async (req, res) => {
  if (req.query.completed !== 'true') {
    return res.status(400).json({ errors: { query: 'Use ?completed=true to clear completed todos.' } });
  }
  const todos = await readTodos();
  await writeTodos(todos.filter((t) => !t.completed));
  res.status(204).end();
}));

app.delete('/api/todos/:id', wrap(async (req, res) => {
  const todos = await readTodos();
  if (!todos.some((t) => t.id === req.params.id)) {
    return res.status(404).json({ errors: { id: 'Todo not found.' } });
  }
  await writeTodos(todos.filter((t) => t.id !== req.params.id));
  res.status(204).end();
}));

// Unknown API routes + error handling
app.use('/api', (_req, res) => res.status(404).json({ errors: { api: 'Not found.' } }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: { body: 'Invalid JSON.' } });
  console.error(err);
  res.status(500).json({ errors: { server: 'Internal server error.' } });
});

/* ---------- start ---------- */
// `--after-port 4200` delays startup until the Angular dev server is listening,
// so StackBlitz shows the Angular app (not the API) as the main preview.
function waitForPort(port, done) {
  const attempt = () => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); done(); });
    socket.once('error', () => { socket.destroy(); setTimeout(attempt, 500); });
  };
  attempt();
}

function listen() {
  app.listen(PORT, () => console.log(`To-Do API listening on http://localhost:${PORT}`));
}

const waitIdx = process.argv.indexOf('--after-port');
if (waitIdx !== -1) waitForPort(Number(process.argv[waitIdx + 1]), listen);
else listen();
