import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureConfigFile, resolveStorageConfig } from '../electron/storageConfig';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbee-storage-config-'));
    tempDirs.push(dir);
    return dir;
};

afterEach(() => {
    while (tempDirs.length) {
        const dir = tempDirs.pop();
        if (!dir) continue;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe('resolveStorageConfig', () => {
    it('defaults Windows production data to %APPDATA%/WorkerBee/workbee_data', () => {
        const root = makeTempDir();
        const appDataDir = path.join(root, 'AppData', 'Roaming');
        const exePath = path.join(root, 'bin', 'WorkerBee.exe');

        const resolved = resolveStorageConfig({
            appDataDir,
            exePath,
            platform: 'win32',
            env: {},
        });

        expect(resolved.dataDir).toBe(path.join(appDataDir, 'WorkerBee', 'workbee_data'));
        expect(resolved.dataDirSource).toBe('default');
        expect(resolved.preferredConfigPath).toBe(path.join(appDataDir, 'WorkerBee', 'config.json'));
    });

    it('uses config.json in the user app-data directory when present', () => {
        const root = makeTempDir();
        const appDataDir = path.join(root, 'AppData', 'Roaming');
        const configPath = path.join(appDataDir, 'WorkerBee', 'config.json');
        const customDataDir = path.join(root, 'persistent-data');

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, `${JSON.stringify({ dataDir: customDataDir }, null, 2)}\n`, 'utf8');

        const resolved = resolveStorageConfig({
            appDataDir,
            exePath: path.join(root, 'bin', 'WorkerBee.exe'),
            platform: 'win32',
            env: {},
        });

        expect(resolved.configPath).toBe(configPath);
        expect(resolved.dataDir).toBe(customDataDir);
        expect(resolved.dataDirSource).toBe('config');
    });

    it('resolves relative dataDir values relative to the config file', () => {
        const root = makeTempDir();
        const appDataDir = path.join(root, 'AppData', 'Roaming');
        const configPath = path.join(root, 'bin', 'config.json');

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, `${JSON.stringify({ dataDir: '../shared/workbee-data' }, null, 2)}\n`, 'utf8');

        const resolved = resolveStorageConfig({
            appDataDir,
            exePath: path.join(root, 'bin', 'WorkerBee.exe'),
            platform: 'win32',
            env: {},
        });

        expect(resolved.configPath).toBe(configPath);
        expect(resolved.dataDir).toBe(path.join(root, 'shared', 'workbee-data'));
    });

    it('searches config.json next to the exe when the user config is missing', () => {
        const root = makeTempDir();
        const appDataDir = path.join(root, 'AppData', 'Roaming');
        const configPath = path.join(root, 'bin', 'config.json');
        const customDataDir = path.join(root, 'portable-data');

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, `${JSON.stringify({ dataDir: customDataDir }, null, 2)}\n`, 'utf8');

        const resolved = resolveStorageConfig({
            appDataDir,
            exePath: path.join(root, 'bin', 'WorkerBee.exe'),
            platform: 'win32',
            env: {},
        });

        expect(resolved.configPath).toBe(configPath);
        expect(resolved.dataDir).toBe(customDataDir);
        expect(resolved.dataDirSource).toBe('config');
    });

    it('falls back to legacy exe-adjacent data when default user-data storage is missing', () => {
        const root = makeTempDir();
        const appDataDir = path.join(root, 'AppData', 'Roaming');
        const legacyDataDir = path.join(root, 'bin', 'workbee_data');

        fs.mkdirSync(legacyDataDir, { recursive: true });

        const resolved = resolveStorageConfig({
            appDataDir,
            exePath: path.join(root, 'bin', 'WorkerBee.exe'),
            platform: 'win32',
            env: {},
        });

        expect(resolved.dataDir).toBe(legacyDataDir);
        expect(resolved.dataDirSource).toBe('legacy-exe');
    });
});

describe('ensureConfigFile', () => {
    it('creates the file once and leaves existing config untouched', () => {
        const root = makeTempDir();
        const configPath = path.join(root, 'WorkerBee', 'config.json');

        expect(ensureConfigFile(configPath, { dataDir: 'C:/Workbee/data' })).toBe(true);
        expect(ensureConfigFile(configPath, { dataDir: 'C:/Other' })).toBe(false);
        expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ dataDir: 'C:/Workbee/data' });
    });
});
