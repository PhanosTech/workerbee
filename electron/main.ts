import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as db from '../database';
import {
    DataDirSource,
    DataDirectoryInspection,
    ResolvedStorageConfig,
    ensureConfigFile,
    ensureDataDirectory,
    inspectDataDirectory,
    readDesktopConfig,
    resolvePathValue,
    resolveStorageConfig,
    writeDesktopConfig,
} from './storageConfig';

if (process.platform === 'win32') {
    try {
        app.setAppUserModelId('com.workbee.app');
    } catch {
        // ignore
    }
}

const isDev = !app.isPackaged;
const DEV_CONFIG_FILE_NAME = 'workbee.dev.config.json';

type StorageInspectionResponse = {
    normalizedPath: string;
    exists: boolean;
    willCreateDirectory: boolean;
    hasExistingData: boolean;
    dataFiles: string[];
};

type StorageSettingsResponse = {
    dataDir: string;
    dataDirSource: DataDirSource;
    defaultDataDir: string;
    configPath: string | null;
    preferredConfigPath: string;
    hasExistingData: boolean;
    dataFiles: string[];
    envOverrideActive: boolean;
    isDev: boolean;
};

type SetDataDirectoryResponse = StorageSettingsResponse & {
    changed: boolean;
    createdDirectory: boolean;
    loadedExistingData: boolean;
    startedFresh: boolean;
};

let mainWindow: BrowserWindow | null = null;
let currentStorage: ResolvedStorageConfig | null = null;

function createWindow() {
    const windowIcon = path.join(__dirname, '..', process.platform === 'win32' ? 'favicon.ico' : 'logo.png');
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'WorkerBee',
        icon: windowIcon,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true,
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:9229');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.control && input.shift && input.key.toLowerCase() === 'i') {
                mainWindow?.webContents.openDevTools();
                event.preventDefault();
            }
        });
    }
}

const getRuntimeDirs = () => {
    const homeDir = app.getPath('home');
    return {
        homeDir,
        localAppDataDir: process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
        roamingAppDataDir: process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
    };
};

const buildLegacyDbPaths = (dataDir: string): string[] => {
    const { homeDir, localAppDataDir, roamingAppDataDir } = getRuntimeDirs();
    return Array.from(
        new Set([
            path.join(path.dirname(dataDir), 'workbee.json'),
            path.join(homeDir, 'workerbee', 'workbee.json'),
            path.join(localAppDataDir, 'workerbee', 'workbee.json'),
            path.join(roamingAppDataDir, 'WorkerBee', 'workbee.json'),
            path.join(path.dirname(process.execPath), 'workbee.json'),
        ].map((entry) => path.normalize(entry)))
    );
};

const applyStorageEnvironment = (storage: ResolvedStorageConfig) => {
    process.env.DB_PATH = storage.dataDir;
    process.env.WORKERBEE_LEGACY_DB_PATHS = buildLegacyDbPaths(storage.dataDir).join(path.delimiter);
};

const resolveDevStorageConfig = (): ResolvedStorageConfig => {
    const repoRoot = path.resolve(__dirname, '..');
    const preferredConfigPath = path.join(repoRoot, DEV_CONFIG_FILE_NAME);
    const loadedConfig = readDesktopConfig(preferredConfigPath);
    const configPath = loadedConfig ? preferredConfigPath : null;
    const envDataDir = resolvePathValue(process.env.WORKERBEE_DATA_DIR, process.cwd());
    const configuredDataDir = loadedConfig
        ? resolvePathValue(loadedConfig.dataDir, path.dirname(preferredConfigPath))
        : null;
    const defaultDataDir = path.join(repoRoot, 'workbee_data');

    if (envDataDir) {
        return {
            configPath,
            preferredConfigPath,
            searchedConfigPaths: [preferredConfigPath],
            dataDir: envDataDir,
            dataDirSource: 'env',
            defaultDataDir,
            legacyExeDataDir: defaultDataDir,
        };
    }

    if (configuredDataDir) {
        return {
            configPath: preferredConfigPath,
            preferredConfigPath,
            searchedConfigPaths: [preferredConfigPath],
            dataDir: configuredDataDir,
            dataDirSource: 'config',
            defaultDataDir,
            legacyExeDataDir: defaultDataDir,
        };
    }

    return {
        configPath,
        preferredConfigPath,
        searchedConfigPaths: [preferredConfigPath],
        dataDir: defaultDataDir,
        dataDirSource: 'default',
        defaultDataDir,
        legacyExeDataDir: defaultDataDir,
    };
};

const resolveCurrentStorage = (): ResolvedStorageConfig => {
    if (isDev) return resolveDevStorageConfig();

    const { homeDir, localAppDataDir, roamingAppDataDir } = getRuntimeDirs();
    return resolveStorageConfig({
        homeDir,
        appDataDir: roamingAppDataDir,
        localAppDataDir,
        exePath: process.execPath,
    });
};

const refreshCurrentStorage = (): ResolvedStorageConfig => {
    const resolved = resolveCurrentStorage();
    currentStorage = resolved;
    applyStorageEnvironment(resolved);
    return resolved;
};

const getStorageConfigBaseDir = (): string => {
    const configPath = currentStorage?.configPath || currentStorage?.preferredConfigPath;
    return configPath ? path.dirname(configPath) : process.cwd();
};

const toInspectionResponse = (inspection: DataDirectoryInspection): StorageInspectionResponse => ({
    normalizedPath: inspection.normalizedPath,
    exists: inspection.exists,
    willCreateDirectory: !inspection.exists,
    hasExistingData: inspection.hasPersistedState,
    dataFiles: inspection.detectedFiles,
});

const toStorageSettingsResponse = (storage: ResolvedStorageConfig): StorageSettingsResponse => {
    const inspection = inspectDataDirectory(storage.dataDir);
    return {
        dataDir: storage.dataDir,
        dataDirSource: storage.dataDirSource,
        defaultDataDir: storage.defaultDataDir,
        configPath: storage.configPath,
        preferredConfigPath: storage.preferredConfigPath,
        hasExistingData: inspection.hasPersistedState,
        dataFiles: inspection.detectedFiles,
        envOverrideActive: storage.dataDirSource === 'env',
        isDev,
    };
};

const logStorageConfig = (storage: ResolvedStorageConfig) => {
    console.log(
        [
            `[workbee] Data dir: ${storage.dataDir}`,
            `[workbee] Data dir source: ${storage.dataDirSource}`,
            storage.configPath
                ? `[workbee] Config: ${storage.configPath}`
                : `[workbee] Config search paths: ${storage.searchedConfigPaths.join(', ')}`,
        ].join('\n')
    );
};

const getStorageSettings = (): StorageSettingsResponse => {
    if (!currentStorage) throw new Error('Storage has not been initialized yet.');
    return toStorageSettingsResponse(currentStorage);
};

const switchDataDirectory = async (rawDataDir: string): Promise<SetDataDirectoryResponse> => {
    if (!currentStorage) throw new Error('Storage has not been initialized yet.');
    if (currentStorage.dataDirSource === 'env') {
        throw new Error('WORKERBEE_DATA_DIR is active. Remove the environment override to change the data directory from Settings.');
    }

    const previousStorage = currentStorage;
    const preparedDirectory = ensureDataDirectory(rawDataDir, getStorageConfigBaseDir());
    const normalizedPath = preparedDirectory.normalizedPath;
    const samePath = path.normalize(previousStorage.dataDir) === path.normalize(normalizedPath);
    const targetConfigPath = previousStorage.configPath || previousStorage.preferredConfigPath;
    const hadExistingConfig = fs.existsSync(targetConfigPath);
    const previousConfig = readDesktopConfig(targetConfigPath) || {};

    writeDesktopConfig(targetConfigPath, {
        ...previousConfig,
        dataDir: normalizedPath,
    });

    try {
        const nextStorage = refreshCurrentStorage();
        if (!samePath) {
            await db.reload();
        }
        logStorageConfig(nextStorage);
        return {
            ...toStorageSettingsResponse(nextStorage),
            changed: !samePath,
            createdDirectory: preparedDirectory.createdDirectory,
            loadedExistingData: preparedDirectory.hasPersistedState,
            startedFresh: !preparedDirectory.hasPersistedState,
        };
    } catch (err) {
        if (hadExistingConfig) {
            writeDesktopConfig(targetConfigPath, previousConfig);
        } else if (fs.existsSync(targetConfigPath)) {
            fs.rmSync(targetConfigPath, { force: true });
        }
        currentStorage = previousStorage;
        applyStorageEnvironment(previousStorage);
        if (!samePath) {
            await db.reload();
        }
        throw err;
    }
};

function setupIpcHandlers() {
    ipcMain.handle('getStorageSettings', () => getStorageSettings());
    ipcMain.handle('selectDataDirectory', async () => {
        const dialogOptions = {
            defaultPath: currentStorage?.dataDir,
            properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
        };
        const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || !result.filePaths[0]) return null;
        return result.filePaths[0];
    });
    ipcMain.handle('inspectDataDirectory', (_e: IpcMainInvokeEvent, rawDataDir: string) =>
        toInspectionResponse(inspectDataDirectory(rawDataDir, getStorageConfigBaseDir()))
    );
    ipcMain.handle('setDataDirectory', (_e: IpcMainInvokeEvent, { dataDir }: { dataDir: string }) =>
        switchDataDirectory(dataDir)
    );

    // Categories
    ipcMain.handle('getCategories', () => db.getCategories());
    ipcMain.handle('createCategory', (_e: IpcMainInvokeEvent, { parent_id, name, color }: { parent_id: number | null, name: string, color: string | null }) => db.createCategory(parent_id, name, color));
    ipcMain.handle('updateCategory', (_e: IpcMainInvokeEvent, { id, parent_id, name, color, position }: { id: number, parent_id: number | null, name: string, color: string | null, position?: number | null }) => db.updateCategory(id, parent_id, name, color, position));
    ipcMain.handle('reorderCategories', (_e: IpcMainInvokeEvent, { parent_id, ordered_ids }: { parent_id: number | null, ordered_ids: (number | string)[] }) => db.reorderCategories(parent_id, ordered_ids));
    ipcMain.handle('archiveCategory', (_e: IpcMainInvokeEvent, id: number) => db.archiveCategory(id));

    // Label Notes
    ipcMain.handle('getLabelNotes', (_e: IpcMainInvokeEvent, { categoryId, type }: { categoryId: number, type?: string | null }) => db.getLabelNotes(categoryId, type));
    ipcMain.handle('getLabelNote', (_e: IpcMainInvokeEvent, id: number) => db.getLabelNote(id));
    ipcMain.handle('addLabelNote', (_e: IpcMainInvokeEvent, { categoryId, title, content, type }: { categoryId: number, title: string | null, content: string | null, type: string }) => db.addLabelNote(categoryId, title, content, type));
    ipcMain.handle('updateLabelNote', (_e: IpcMainInvokeEvent, { id, title, content }: { id: number, title: string | null, content: string | null }) => db.updateLabelNote(id, title, content));
    ipcMain.handle('deleteLabelNote', (_e: IpcMainInvokeEvent, id: number) => db.deleteLabelNote(id));
    ipcMain.handle('archiveLabelNote', (_e: IpcMainInvokeEvent, id: number) => db.archiveLabelNote(id));
    ipcMain.handle('unarchiveLabelNote', (_e: IpcMainInvokeEvent, id: number) => db.unarchiveLabelNote(id));

    // Tasks
    ipcMain.handle('getTasks', (_e: IpcMainInvokeEvent, filters: any = {}) => {
        return db.getTasksByFilters(filters);
    });
    ipcMain.handle('getTask', async (_e: IpcMainInvokeEvent, id: number) => {
        const task = await db.getTask(id);
        if (!task) return null;
        const [todos, logs, notes] = await Promise.all([
            db.getTaskTodos(id),
            db.getTaskLogs(id),
            db.getTaskNotes(id),
        ]);
        return { ...task, todos, logs, notes };
    });
    ipcMain.handle('getNote', (_e: IpcMainInvokeEvent, id: number) => db.getTaskNote(id));
    ipcMain.handle('createTask', (_e: IpcMainInvokeEvent, { category_id, title, description, url, links }: { category_id: number | null, title: string, description: string | null, url: string | null, links?: db.ExternalLink[] }) => db.createTask(category_id, title, description, url, links));
    ipcMain.handle('updateTask', (_e: IpcMainInvokeEvent, { id, data }: { id: number, data: any }) => {
        return db.updateTask(
            id,
            data.category_id,
            data.title,
            data.description,
            data.url,
            data.status,
            data.story_points,
            data.priority,
            data.task_type,
            data.due_date,
            data.board_position,
            data.list_position,
            data.links
        );
    });
    ipcMain.handle('reorderTasks', (_e: IpcMainInvokeEvent, { status, ordered_ids }: { status: string, ordered_ids: (number | string)[] }) => db.reorderTasksInStatus(status, ordered_ids));
    ipcMain.handle('reorderTasksInCategory', (_e: IpcMainInvokeEvent, { categoryId, ordered_ids }: { categoryId: number, ordered_ids: (number | string)[] }) => db.reorderTasksInCategory(categoryId, ordered_ids));
    ipcMain.handle('archiveTask', (_e: IpcMainInvokeEvent, id: number) => db.archiveTask(id));
    ipcMain.handle('archiveDoneTasks', () => db.archiveDoneTasks());
    ipcMain.handle('hardDeleteTask', (_e: IpcMainInvokeEvent, id: number) => db.deleteTask(id));

    // Task Sub-resources
    ipcMain.handle('addTodo', (_e: IpcMainInvokeEvent, { taskId, text }: { taskId: number, text: string }) => db.addTodo(taskId, text));
    ipcMain.handle('updateTodo', (_e: IpcMainInvokeEvent, { id, text, completed }: { id: number, text: string, completed: boolean | number }) => db.updateTodo(id, text, completed));
    ipcMain.handle('reorderTodos', (_e: IpcMainInvokeEvent, { taskId, ordered_ids }: { taskId: number, ordered_ids: (number | string)[] }) => db.reorderTodosForTask(taskId, ordered_ids));
    ipcMain.handle('deleteTodo', (_e: IpcMainInvokeEvent, id: number) => db.deleteTodo(id));
    ipcMain.handle('addLog', (_e: IpcMainInvokeEvent, { taskId, content }: { taskId: number, content: string | null }) => db.addLog(taskId, content));
    ipcMain.handle('updateLog', (_e: IpcMainInvokeEvent, { id, content }: { id: number, content: string | null }) => db.updateLog(id, content));
    ipcMain.handle('deleteLog', (_e: IpcMainInvokeEvent, id: number) => db.deleteLog(id));
    ipcMain.handle('addNote', (_e: IpcMainInvokeEvent, { taskId, title, content, type }: { taskId: number, title: string | null, content: string | null, type: string }) => db.addNote(taskId, title, content, type));
    ipcMain.handle('updateNote', (_e: IpcMainInvokeEvent, { id, title, content }: { id: number, title: string | null, content: string | null }) => db.updateNote(id, title, content));
    ipcMain.handle('deleteNote', (_e: IpcMainInvokeEvent, id: number) => db.deleteNote(id));
    ipcMain.handle('getTaskNotes', (_e: IpcMainInvokeEvent, taskId: number) => db.getTaskNotes(taskId));

    // Topics
    ipcMain.handle('getTopics', (_e: IpcMainInvokeEvent, filters: any = {}) => db.getTopics(filters));
    ipcMain.handle('getTopic', (_e: IpcMainInvokeEvent, id: number) => db.getTopic(id));
    ipcMain.handle('createTopic', (_e: IpcMainInvokeEvent, topic: any) => db.createTopic(topic.title, topic.description, topic.status, topic.tags, topic.links, topic.category_ids));
    ipcMain.handle('updateTopic', (_e: IpcMainInvokeEvent, { id, topic }: { id: number, topic: any }) => db.updateTopic(id, topic.title, topic.description, topic.status, topic.tags, topic.links, topic.category_ids));
    ipcMain.handle('reorderTopics', (_e: IpcMainInvokeEvent, ordered_ids: (number | string)[]) => db.reorderTopics(ordered_ids));
    ipcMain.handle('archiveTopic', (_e: IpcMainInvokeEvent, id: number) => db.archiveTopic(id));
    ipcMain.handle('deleteTopic', (_e: IpcMainInvokeEvent, id: number) => db.deleteTopic(id));

    // Topic Sub-resources
    ipcMain.handle('getTopicTodos', (_e: IpcMainInvokeEvent, id: number) => db.getTopicTodos(id));
    ipcMain.handle('addTopicTodo', (_e: IpcMainInvokeEvent, { id, text }: { id: number, text: string }) => db.addTopicTodo(id, text));
    ipcMain.handle('updateTopicTodo', (_e: IpcMainInvokeEvent, { id, text, completed }: { id: number, text: string, completed: boolean | number }) => db.updateTopicTodo(id, text, completed));
    ipcMain.handle('deleteTopicTodo', (_e: IpcMainInvokeEvent, id: number) => db.deleteTopicTodo(id));
    ipcMain.handle('getTopicLogs', (_e: IpcMainInvokeEvent, id: number) => db.getTopicLogs(id));
    ipcMain.handle('addTopicLog', (_e: IpcMainInvokeEvent, { id, content }: { id: number, content: string | null }) => db.addTopicLog(id, content));
    ipcMain.handle('updateTopicLog', (_e: IpcMainInvokeEvent, { id, content }: { id: number, content: string | null }) => db.updateTopicLog(id, content));
    ipcMain.handle('deleteTopicLog', (_e: IpcMainInvokeEvent, id: number) => db.deleteTopicLog(id));
    ipcMain.handle('getTopicNotes', (_e: IpcMainInvokeEvent, id: number) => db.getTopicNotes(id));
    ipcMain.handle('getAllTopicNotes', (_e: IpcMainInvokeEvent, filters: any = {}) => db.getAllTopicNotes(filters));
    ipcMain.handle('addTopicNote', (_e: IpcMainInvokeEvent, { id, title, content, type }: { id: number, title: string | null, content: string | null, type: string }) => db.addTopicNote(id, title, content, type));
    ipcMain.handle('updateTopicNote', (_e: IpcMainInvokeEvent, { id, title, content, created_at }: { id: number, title: string | null, content: string | null, created_at?: string | null }) => db.updateTopicNote(id, title, content, created_at));
    ipcMain.handle('deleteTopicNote', (_e: IpcMainInvokeEvent, id: number) => db.deleteTopicNote(id));

    // Task-Topic Links
    ipcMain.handle('getTaskTopics', (_e: IpcMainInvokeEvent, taskId: number) => db.getTaskTopics(taskId));
    ipcMain.handle('setTaskTopics', (_e: IpcMainInvokeEvent, { taskId, topicIds }: { taskId: number, topicIds: (number | string)[] }) => db.setTaskTopics(taskId, topicIds));
    ipcMain.handle('getTopicTasks', (_e: IpcMainInvokeEvent, topicId: number) => db.getTopicTasks(topicId));
    ipcMain.handle('setTopicTasks', (_e: IpcMainInvokeEvent, { topicId, taskIds }: { topicId: number, taskIds: (number | string)[] }) => db.setTopicTasks(topicId, taskIds));

    // Search
    ipcMain.handle('search', (_e: IpcMainInvokeEvent, { q, limit }: { q: string, limit?: number }) => db.search(q, limit));

    // Weekly Status
    ipcMain.handle('getWeeklyNote', (_e: IpcMainInvokeEvent, date: string) => db.getWeeklyNoteForDate(date));
    ipcMain.handle('updateWeeklyNote', (_e: IpcMainInvokeEvent, { id, content }: { id: number, content: string }) => db.updateWeeklyNote(id, content));

    // Journal
    ipcMain.handle('getJournalEntries', () => db.getJournalEntries());
    ipcMain.handle('getLatestJournalEntry', () => db.getLatestJournalEntry());
    ipcMain.handle('getJournalEntry', (_e: IpcMainInvokeEvent, date: string) => db.getJournalEntryByDate(date));
    ipcMain.handle('upsertJournalEntry', (_e: IpcMainInvokeEvent, { date, content }: { date: string, content: string }) => db.upsertJournalEntry(date, content));

    // Reports
    ipcMain.handle('openExternal', (_e, url) => require('electron').shell.openExternal(url));
    ipcMain.handle('getReports', (_e: IpcMainInvokeEvent, { startDate, endDate }: { startDate?: string, endDate?: string }) => {
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return db.getLogsByDateRange(start, end);
    });
    ipcMain.handle('getReportSummary', async (_e: IpcMainInvokeEvent, { startDate, endDate }: { startDate?: string, endDate?: string }) => {
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const logs = await db.getLogsByDateRange(start, end);
        const completedTasks = await db.getTasksCompletedByDateRange(start, end);
        return { startDate: start, endDate: end, logs, completedTasks };
    });
    ipcMain.handle('getArchive', async (_e: IpcMainInvokeEvent, { startDate, endDate, weeks }: { startDate?: string, endDate?: string, weeks?: number | string }) => {
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || (weeks
            ? new Date(Date.now() - Number(weeks) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        const [tasks, notes] = await Promise.all([
            db.getArchivedTasksByDateRange(start, end),
            db.getArchivedLabelNotesByDateRange(start, end),
        ]);
        return { startDate: start, endDate: end, tasks, notes };
    });
}

app.whenReady().then(async () => {
    try {
        const storage = refreshCurrentStorage();

        if (!isDev && process.platform === 'win32' && !storage.configPath && storage.dataDirSource === 'default') {
            try {
                ensureConfigFile(storage.preferredConfigPath, { dataDir: storage.dataDir });
            } catch (err) {
                console.warn('[workbee] Failed to create default config file:', err);
            }
        }

        logStorageConfig(storage);
        await db.init();
        setupIpcHandlers();
        createWindow();
    } catch (err) {
        console.error('Failed to initialize app:', err);
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
