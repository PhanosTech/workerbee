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
- If packaging fails with `Cannot create symbolic link` / `A required privilege is not held by the client`, enable Windows Developer Mode (or run your terminal as Administrator) and retry.
  - `npm run pack:win` automatically retries with `win.signAndEditExecutable=false` as a fallback (the app will build, but exe icon/metadata + code signing are skipped).
  - Force fallback: `set WORKBEE_FORCE_NO_WIN_RCEDIT=1` (CMD) or `$env:WORKBEE_FORCE_NO_WIN_RCEDIT=1` (PowerShell).
  - Disable fallback: `set WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (CMD) or `$env:WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (PowerShell).

## Data

- Local data file: `workbee.json` (created in the project root)
