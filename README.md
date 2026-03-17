# WorkerBee

WorkerBee is a local-first, single-user task manager with categories, notes, todos, and work logs. It runs entirely on your machine (no hosted backend required) and stores its data in local JSON files.

## How it works

- UI: React (Vite) app that calls the API under `/api`.
- API: Express server (`server.js`) that serves JSON endpoints and (in production) also serves the built UI from `dist/`.
- Data: stored in `workbee_data/` (created automatically). Older `workbee.json` installs are migrated on first packaged launch.

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
  - App data is no longer meant to live inside `bin/win-unpacked/`; packaged builds default to `%USERPROFILE%\workerbee\workbee_data` (`C:\Users\<you>\workerbee\workbee_data`).

### Common packaging error (symlink privilege)

If packaging fails with `Cannot create symbolic link` / `A required privilege is not held by the client`, Windows is blocking symlink creation while `electron-builder` extracts its helper tools.

- Recommended fix: enable Windows Developer Mode (or run your terminal as Administrator) and retry.
- `npm run pack:win` automatically falls back to `win.signAndEditExecutable=false` when symlinks are blocked (the app will build, but exe icon/metadata + code signing are skipped).
  - Force fallback: `set WORKBEE_FORCE_NO_WIN_RCEDIT=1` (CMD) or `$env:WORKBEE_FORCE_NO_WIN_RCEDIT=1` (PowerShell).
  - Disable fallback: `set WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (CMD) or `$env:WORKBEE_NO_WIN_SYMLINK_FALLBACK=1` (PowerShell).

## Data

- Local data store: `workbee_data/`
  - Dev: stored in `workbee_data/` in the project root.
  - Electron production on Windows: stored in `%USERPROFILE%\workerbee\workbee_data` by default.
  - Electron production on Windows still checks the previous `%LOCALAPPDATA%\workerbee\workbee_data`, the older `%APPDATA%\WorkerBee\workbee_data`, and `workbee_data` next to the packaged executable as legacy fallbacks when the new home-directory location does not exist yet.
  - If you still have the old single-file format (`workbee.json`), the packaged app will auto-import it on first launch from `%USERPROFILE%\workerbee\workbee.json`, `%LOCALAPPDATA%\workerbee\workbee.json`, `%APPDATA%\WorkerBee\workbee.json`, or next to `WorkerBee.exe`, then rename the source file to `.bak`.

## Electron production config

- Windows config file search order:
  - `%USERPROFILE%\workerbee\config.json`
  - `%LOCALAPPDATA%\workerbee\config.json` (legacy fallback from recent installs)
  - `%APPDATA%\WorkerBee\config.json` (legacy fallback from older installs)
  - `config.json` next to the packaged `.exe`
  - `WORKERBEE_CONFIG` can point to an explicit config file and overrides both
- Config schema:

```json
{
  "dataDir": "C:\\Users\\YOUR_USER\\workerbee\\workbee_data"
}
```

- `dataDir` may be absolute or relative to the config file location.
- A default `%USERPROFILE%\workerbee\config.json` is created automatically on first packaged Windows launch when no config exists yet.
- A template is included at `config.example.json` in the repo.

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
