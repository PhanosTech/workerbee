const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// Ensure Windows uses the correct AppUserModelID (helps taskbar icon + grouping).
if (process.platform === 'win32') {
    try {
        app.setAppUserModelId('com.workbee.app');
    } catch {
        // ignore
    }
}

// Environment Setup
const isDev = !app.isPackaged;
const PORT = 9339; // API Port
const WEB_PORT = 9229; // Web Port (dev only)

let mainWindow;
let serverProcess;

function createWindow() {
    const windowIcon = path.join(__dirname, '..', process.platform === 'win32' ? 'favicon.ico' : 'logo.png');
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "WorkerBee",
        icon: windowIcon,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
        mainWindow.webContents.openDevTools();
    } else {
        // In production, the server serves the static files
        mainWindow.loadURL(`http://localhost:${PORT}`);
    }
}

function startServer() {
    const serverPath = path.join(__dirname, '../server.js');

    // Determine DB path
    // In production (unpacked dir), execPath is /path/to/app/WorkerBee.exe
    // We want data in /path/to/app/workbee.db
    let dbPath;
    if (isDev) {
        dbPath = path.join(__dirname, '../workbee.json');
    } else {
        dbPath = path.join(path.dirname(process.execPath), 'workbee.json');
    }

    // Fork the server process
    const env = {
        ...process.env,
        NODE_ENV: isDev ? 'development' : 'production',
        API_PORT: PORT,
        WEB_PORT: PORT, // In prod, server does both
        DB_PATH: dbPath
    };

    serverProcess = fork(serverPath, [], {
        env,
        stdio: 'inherit' // Pipe logs to main process console
    });

    console.log(`[Electron] API Server started (PID: ${serverProcess.pid}) using DB: ${dbPath}`);
}

app.whenReady().then(() => {
    startServer();
    // Give server a moment to start
    setTimeout(createWindow, 1000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (serverProcess) {
        console.log('[Electron] Killing server process...');
        serverProcess.kill();
    }
});
