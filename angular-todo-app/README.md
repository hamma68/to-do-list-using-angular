# Angular 22 To-Do (with Express backend)

Full-stack To-Do list:

- **Frontend:** Angular 22 – standalone components, signals, zoneless, OnPush, reactive forms, new control flow (`@if`/`@for`)
- **Backend:** Express REST API storing data in `server/data/todos.json`
- **Validation:** client-side (reactive forms + custom validators) *and* server-side (400 + field errors shown in the form)

## Run on StackBlitz
1. Go to https://stackblitz.com → **Create → Import from folder/zip** (or drag this folder into a new Node.js project), or push to GitHub and open `https://stackblitz.com/github/<user>/<repo>`.
2. StackBlitz reads `.stackblitzrc`, runs `npm install` and `npm start`.
3. Use the preview of **port 4200** (Angular). The API runs on port 3000; Angular proxies `/api` to it (`proxy.conf.json`).

## Run locally
```bash
npm install
npm start      # http://localhost:4200
```

## API
| Method | URL | Body |
|---|---|---|
| GET | `/api/todos` | – |
| POST | `/api/todos` | `{ title, priority?, dueDate? }` |
| PUT | `/api/todos/:id` | `{ title, priority?, dueDate? }` |
| PATCH | `/api/todos/:id` | `{ completed }` |
| DELETE | `/api/todos/:id` | – |
| DELETE | `/api/todos?completed=true` | – |

## Validation rules
- Title: required, not only spaces, 3–100 characters (trimmed)
- Priority: `low` / `medium` / `high`
- Due date: optional, valid `YYYY-MM-DD`, not in the past
