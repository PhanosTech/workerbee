import * as fs from 'fs';
import * as path from 'path';

const WINDOWS_CONFIG_DIR_NAME = 'workerbee';
const WINDOWS_LEGACY_CONFIG_DIR_NAME = 'WorkerBee';
const CONFIG_FILE_NAME = 'config.json';
const DATA_DIR_NAME = 'workbee_data';

export type DataDirSource = 'env' | 'config' | 'default' | 'legacy-local' | 'legacy-roaming' | 'legacy-exe';

export interface WorkerBeeDesktopConfig {
    dataDir?: string | null;
}

export interface ResolvedStorageConfig {
    configPath: string | null;
    preferredConfigPath: string;
    searchedConfigPaths: string[];
    dataDir: string;
    dataDirSource: DataDirSource;
    defaultDataDir: string;
    legacyExeDataDir: string;
}

interface ResolveStorageConfigOptions {
    appDataDir?: string;
    homeDir?: string;
    localAppDataDir?: string;
    env?: NodeJS.ProcessEnv;
    exePath: string;
    platform?: NodeJS.Platform;
}

const normalizeFsPath = (value: string | null | undefined, baseDir: string): string | null => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    return path.normalize(path.isAbsolute(raw) ? raw : path.resolve(baseDir, raw));
};

const uniquePaths = (paths: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of paths) {
        const normalized = path.normalize(entry);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
};

const readConfigFile = (filePath: string): WorkerBeeDesktopConfig | null => {
    if (!fs.existsSync(filePath)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as WorkerBeeDesktopConfig;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read WorkerBee config at ${filePath}: ${message}`);
    }
};

const getWindowsConfigDir = (appDataDir: string): string =>
    path.join(appDataDir, WINDOWS_CONFIG_DIR_NAME);

const getWindowsLegacyConfigDir = (appDataDir: string): string =>
    path.join(appDataDir, WINDOWS_LEGACY_CONFIG_DIR_NAME);

export const resolveStorageConfig = ({
    appDataDir = '',
    homeDir = process.cwd(),
    localAppDataDir = '',
    env = process.env,
    exePath,
    platform = process.platform,
}: ResolveStorageConfigOptions): ResolvedStorageConfig => {
    const exeDir = path.dirname(exePath);
    const preferredConfigDir = platform === 'win32'
        ? getWindowsConfigDir(homeDir)
        : exeDir;
    const preferredConfigPath = path.join(preferredConfigDir, CONFIG_FILE_NAME);
    const legacyLocalConfigPath = platform === 'win32' && localAppDataDir
        ? path.join(getWindowsConfigDir(localAppDataDir), CONFIG_FILE_NAME)
        : null;
    const legacyRoamingConfigPath = platform === 'win32' && appDataDir
        ? path.join(getWindowsLegacyConfigDir(appDataDir), CONFIG_FILE_NAME)
        : null;
    const exeConfigPath = path.join(exeDir, CONFIG_FILE_NAME);
    const envConfigPath = normalizeFsPath(env.WORKERBEE_CONFIG, process.cwd());
    const searchedConfigPaths = uniquePaths([
        ...(envConfigPath ? [envConfigPath] : []),
        preferredConfigPath,
        ...(legacyLocalConfigPath ? [legacyLocalConfigPath] : []),
        ...(legacyRoamingConfigPath ? [legacyRoamingConfigPath] : []),
        exeConfigPath,
    ]);

    let configPath: string | null = null;
    let config: WorkerBeeDesktopConfig | null = null;
    for (const candidate of searchedConfigPaths) {
        const loaded = readConfigFile(candidate);
        if (!loaded) continue;
        configPath = candidate;
        config = loaded;
        break;
    }

    const defaultDataDir = platform === 'win32'
        ? path.join(preferredConfigDir, DATA_DIR_NAME)
        : path.join(exeDir, DATA_DIR_NAME);
    const legacyLocalDataDir = platform === 'win32' && localAppDataDir
        ? path.join(getWindowsConfigDir(localAppDataDir), DATA_DIR_NAME)
        : '';
    const legacyRoamingDataDir = platform === 'win32' && appDataDir
        ? path.join(getWindowsLegacyConfigDir(appDataDir), DATA_DIR_NAME)
        : '';
    const legacyExeDataDir = path.join(exeDir, DATA_DIR_NAME);

    const envDataDir = normalizeFsPath(env.WORKERBEE_DATA_DIR, process.cwd());
    if (envDataDir) {
        return {
            configPath,
            preferredConfigPath,
            searchedConfigPaths,
            dataDir: envDataDir,
            dataDirSource: 'env',
            defaultDataDir,
            legacyExeDataDir,
        };
    }

    if (configPath) {
        const configuredDataDir = normalizeFsPath(config?.dataDir, path.dirname(configPath));
        if (configuredDataDir) {
            return {
                configPath,
                preferredConfigPath,
                searchedConfigPaths,
                dataDir: configuredDataDir,
                dataDirSource: 'config',
                defaultDataDir,
                legacyExeDataDir,
            };
        }
    }

    const hasLegacyLocalData = !!legacyLocalDataDir && fs.existsSync(legacyLocalDataDir);
    const hasLegacyRoamingData = !!legacyRoamingDataDir && fs.existsSync(legacyRoamingDataDir);

    const useLegacyLocalData =
        platform === 'win32' &&
        !fs.existsSync(defaultDataDir) &&
        hasLegacyLocalData;

    const useLegacyRoamingData =
        platform === 'win32' &&
        !fs.existsSync(defaultDataDir) &&
        !hasLegacyLocalData &&
        hasLegacyRoamingData;

    const useLegacyExeData =
        platform === 'win32' &&
        !fs.existsSync(defaultDataDir) &&
        !hasLegacyLocalData &&
        !hasLegacyRoamingData &&
        fs.existsSync(legacyExeDataDir);

    return {
        configPath,
        preferredConfigPath,
        searchedConfigPaths,
        dataDir: useLegacyLocalData
            ? legacyLocalDataDir
            : (useLegacyRoamingData ? legacyRoamingDataDir : (useLegacyExeData ? legacyExeDataDir : defaultDataDir)),
        dataDirSource: useLegacyLocalData
            ? 'legacy-local'
            : (useLegacyRoamingData ? 'legacy-roaming' : (useLegacyExeData ? 'legacy-exe' : 'default')),
        defaultDataDir,
        legacyExeDataDir,
    };
};

export const ensureConfigFile = (configPath: string, config: WorkerBeeDesktopConfig): boolean => {
    if (fs.existsSync(configPath)) return false;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return true;
};
