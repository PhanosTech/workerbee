# WorkerBee

Single-user task manager with work logs and reporting, designed to run locally (desktop PWA).

## Development

- Install deps: `npm install`
- Run app (API + UI): `npm run dev`
  - UI: `http://127.0.0.1:9229` (proxies `/api` to the API server)
  - API: `http://127.0.0.1:9339`

## Production build

- Build UI: `npm run build`
- Serve built UI + API: `NODE_ENV=production node server.js`
  - UI: `http://127.0.0.1:9229`
  - API: `http://127.0.0.1:9339`

## Data

- SQLite DB: `workbee.db` (created in the project root)
