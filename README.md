# WorkerBee

WorkerBee is a local-first, single-user task manager with categories, notes, todos, and work logs. It runs entirely on your machine (no hosted backend required) and stores its data in a local JSON file.

## How it works

- UI: React (Vite) app that calls the API under `/api`.
- API: Express server (`server.js`) that serves JSON endpoints and (in production) also serves the built UI from `dist/`.
- Data: stored in `workbee.json` (created automatically).

## Development

- Install deps: `npm install`
- Run app (API + UI together): `npm run dev`
  - UI: `http://127.0.0.1:9229` (proxies `/api` to the API server)
  - API: `http://127.0.0.1:9339`

## Run as a local server (no Electron)

1. Build the UI: `npm run build`
2. Start the local server: `NODE_ENV=production node server.js`
   - UI: `http://127.0.0.1:9229`
   - API: `http://127.0.0.1:9339`

## Run as a desktop app (Electron)

- Dev (loads Vite): `npm run dev` in one terminal, then `npm run electron` in another.
- Production-style (bundled UI served by the local server): build first (`npm run build`), then `npm run electron`.

## Desktop packaging (Windows)

- Prereqs: Node.js + npm installed on Windows.
- Install deps (Windows): `npm install` (or `task init_win` if you use Taskfile).
- Package (Windows): `npm run build && npm run pack:win` (or `task pkg_win`)
  - Output folder: `bin/win-unpacked/`

### Common packaging error (symlink privilege)

If packaging fails with `Cannot create symbolic link` / `A required privilege is not held by the client`, Windows is blocking symlink creation while `electron-builder` extracts its helper tools.

- Recommended fix: enable Windows Developer Mode (or run your terminal as Administrator) and retry.
- `npm run pack:win` automatically falls back to `win.signAndEditExecutable=false` when symlinks are blocked (the app will build, but exe icon/metadata + code signing are skipped).
  - Force fallback: `set WORKBEE_FORCE_NO_WIN_RCEDIT=1` (CMD) or `$env:WORKBEE_FORCE_NO_WIN_RCEDIT=1` (PowerShell).
  - Disable fallback: `set WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (CMD) or `$env:WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (PowerShell).

## Data

- Local data file: `workbee.json`
  - Dev: stored in the project root.
  - Electron production: stored next to the packaged executable (so each install folder has its own data).

## Install as a Linux systemd service

This installs WorkerBee to `/opt/workerbee/` and creates a systemd service named `workerbee`.

- Install: `task install`
- Status/logs: `systemctl status workerbee` / `journalctl -u workerbee -f`
- Uninstall (keeps data): `task uninstall`

### Paths

- App: `/opt/workerbee/`
- Data: `/opt/workerbee/data/workbee.json` (kept on uninstall)
- Config: `/opt/workerbee/config.json`

### Config

Edit `/opt/workerbee/config.json` to change ports/host:

- `host` (default `0.0.0.0`)
- `webPort` (default `9229`)
- `apiPort` (default `9339`)

After changing config: `sudo systemctl restart workerbee`
