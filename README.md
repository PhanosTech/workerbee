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

## Desktop packaging (Windows)

- Windows builds can be produced without Visual Studio build tools (no native modules).
- Install deps (Windows): `task init_win`
- Build (Windows): `task pkg_win` (or `npm run build && npm run pack:win`)

## Data

- Local data file: `workbee.json` (created in the project root)
