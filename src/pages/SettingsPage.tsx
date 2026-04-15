import React, { useEffect, useState } from 'react';
import { api, DataDirectoryInspection, SetDataDirectoryResult, StorageSettings } from '../api';

interface SettingsPageProps {
    onDataDirectoryChanged?: () => void;
}

type NoticeTone = 'success' | 'error' | 'info';

interface NoticeState {
    tone: NoticeTone;
    text: string;
}

const SOURCE_LABELS: Record<StorageSettings['dataDirSource'], string> = {
    env: 'Environment Override',
    config: 'Saved Setting',
    default: 'Default Location',
    'legacy-local': 'Legacy Local Folder',
    'legacy-roaming': 'Legacy Roaming Folder',
    'legacy-exe': 'Legacy App Folder',
};

const inspectionFromSettings = (settings: StorageSettings): DataDirectoryInspection => ({
    normalizedPath: settings.dataDir,
    exists: true,
    willCreateDirectory: false,
    hasExistingData: settings.hasExistingData,
    dataFiles: settings.dataFiles,
});

const getInspectionMessage = (inspection: DataDirectoryInspection): NoticeState => {
    if (inspection.hasExistingData) {
        return {
            tone: 'info',
            text: 'Existing WorkerBee data was found in this folder. Saving will switch the app to that data immediately.',
        };
    }
    if (inspection.willCreateDirectory) {
        return {
            tone: 'info',
            text: 'This folder does not exist yet. WorkerBee will create it and initialize a new empty store there.',
        };
    }
    return {
        tone: 'info',
        text: 'This folder exists but does not contain WorkerBee data yet. WorkerBee will start a new empty store there.',
    };
};

const getApplyMessage = (result: SetDataDirectoryResult): NoticeState => {
    if (!result.changed) {
        return {
            tone: 'success',
            text: 'The data directory setting was saved. WorkerBee will keep using this folder after restart.',
        };
    }
    if (result.loadedExistingData) {
        return {
            tone: 'success',
            text: 'The data directory was updated and existing WorkerBee data was loaded from the selected folder.',
        };
    }
    return {
        tone: 'success',
        text: 'The data directory was updated and a new empty WorkerBee store was initialized in the selected folder.',
    };
};

const getErrorMessage = (err: unknown, fallback: string): NoticeState => ({
    tone: 'error',
    text: err instanceof Error ? err.message : fallback,
});

const SettingsPage: React.FC<SettingsPageProps> = ({ onDataDirectoryChanged }) => {
    const [settings, setSettings] = useState<StorageSettings | null>(null);
    const [draftDataDir, setDraftDataDir] = useState<string>('');
    const [inspection, setInspection] = useState<DataDirectoryInspection | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [busyAction, setBusyAction] = useState<'browse' | 'inspect' | 'save' | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadSettings = async () => {
            try {
                setLoading(true);
                setNotice(null);
                const current = await api.getStorageSettings();
                if (cancelled) return;
                setSettings(current);
                setDraftDataDir(current.dataDir);
                setInspection(inspectionFromSettings(current));
            } catch (err) {
                if (cancelled) return;
                setNotice(getErrorMessage(err, 'Failed to load storage settings.'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadSettings();
        return () => {
            cancelled = true;
        };
    }, []);

    const changesDisabled = !!settings?.envOverrideActive;
    const isBusy = busyAction !== null;

    const handleBrowse = async () => {
        try {
            setBusyAction('browse');
            const selected = await api.selectDataDirectory();
            if (!selected) return;
            setDraftDataDir(selected);
            const nextInspection = await api.inspectDataDirectory(selected);
            setDraftDataDir(nextInspection.normalizedPath);
            setInspection(nextInspection);
            setNotice(getInspectionMessage(nextInspection));
        } catch (err) {
            setNotice(getErrorMessage(err, 'Failed to choose a data directory.'));
        } finally {
            setBusyAction(null);
        }
    };

    const handleInspect = async (candidate = draftDataDir) => {
        const rawPath = String(candidate || '').trim();
        if (!rawPath) {
            setNotice({ tone: 'error', text: 'Enter a folder path first.' });
            return;
        }

        try {
            setBusyAction('inspect');
            const nextInspection = await api.inspectDataDirectory(rawPath);
            setDraftDataDir(nextInspection.normalizedPath);
            setInspection(nextInspection);
            setNotice(getInspectionMessage(nextInspection));
        } catch (err) {
            setInspection(null);
            setNotice(getErrorMessage(err, 'Failed to inspect the selected folder.'));
        } finally {
            setBusyAction(null);
        }
    };

    const handleUseDefault = () => {
        if (!settings) return;
        setDraftDataDir(settings.defaultDataDir);
        setInspection(null);
        setNotice({
            tone: 'info',
            text: 'The default WorkerBee data directory has been loaded into the form. Check it or save it to switch.',
        });
    };

    const handleSave = async () => {
        const rawPath = String(draftDataDir || '').trim();
        if (!rawPath) {
            setNotice({ tone: 'error', text: 'Enter a folder path before saving.' });
            return;
        }

        try {
            setBusyAction('save');
            const result = await api.setDataDirectory(rawPath);
            setSettings(result);
            setDraftDataDir(result.dataDir);
            setInspection(inspectionFromSettings(result));
            setNotice(getApplyMessage(result));
            onDataDirectoryChanged?.();
        } catch (err) {
            setNotice(getErrorMessage(err, 'Failed to update the data directory.'));
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <div className="page settings-page">
            <header className="page-header">
                <div>
                    <h2>Settings</h2>
                    <p className="muted">Choose the folder WorkerBee uses for its JSON data files.</p>
                </div>
            </header>

            {loading && <p className="empty-state">Loading settings…</p>}

            {!loading && settings && (
                <div className="settings-layout">
                    {notice && <div className={`settings-status ${notice.tone}`}>{notice.text}</div>}

                    {settings.envOverrideActive && (
                        <div className="settings-status info">
                            <code>WORKERBEE_DATA_DIR</code> is active, so the app is currently forced to use that folder. Remove the environment override before changing this setting here.
                        </div>
                    )}

                    <section className="settings-card">
                        <h3>Current Data Directory</h3>
                        <div className="settings-path">{settings.dataDir}</div>
                        <div className="settings-meta-grid">
                            <div className="settings-meta-item">
                                <span>Source</span>
                                <strong>{SOURCE_LABELS[settings.dataDirSource]}</strong>
                            </div>
                            <div className="settings-meta-item">
                                <span>Data Files</span>
                                <strong>{settings.dataFiles.length || 0}</strong>
                            </div>
                            <div className="settings-meta-item">
                                <span>Mode</span>
                                <strong>{settings.isDev ? 'Development' : 'Packaged App'}</strong>
                            </div>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h3>Change Data Directory</h3>
                        <label className="settings-field">
                            <span>Folder path</span>
                            <input
                                type="text"
                                value={draftDataDir}
                                onChange={(e) => {
                                    setDraftDataDir(e.target.value);
                                    setInspection(null);
                                }}
                                placeholder={settings.defaultDataDir}
                                disabled={changesDisabled || isBusy}
                            />
                        </label>

                        <div className="settings-actions">
                            <button type="button" onClick={handleBrowse} disabled={changesDisabled || isBusy}>
                                Browse…
                            </button>
                            <button type="button" onClick={() => handleInspect()} disabled={changesDisabled || isBusy}>
                                Check Folder
                            </button>
                            <button type="button" onClick={handleUseDefault} disabled={changesDisabled || isBusy}>
                                Use Default
                            </button>
                            <button type="button" className="primary-btn" onClick={handleSave} disabled={changesDisabled || isBusy}>
                                Save & Switch
                            </button>
                        </div>

                        <p className="muted">The selected folder is saved to config and used immediately. It will still be used after the next app restart.</p>

                        {inspection && (
                            <div className="settings-inspection">
                                <div className="settings-meta-grid">
                                    <div className="settings-meta-item">
                                        <span>Resolved Path</span>
                                        <strong>{inspection.normalizedPath}</strong>
                                    </div>
                                    <div className="settings-meta-item">
                                        <span>Folder Exists</span>
                                        <strong>{inspection.exists ? 'Yes' : 'No'}</strong>
                                    </div>
                                    <div className="settings-meta-item">
                                        <span>Existing Data</span>
                                        <strong>{inspection.hasExistingData ? 'Found' : 'Not Found'}</strong>
                                    </div>
                                </div>
                                <div className="settings-files">
                                    {inspection.dataFiles.length > 0
                                        ? `Detected files: ${inspection.dataFiles.join(', ')}`
                                        : 'No WorkerBee data files detected yet.'}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="settings-card">
                        <h3>Config</h3>
                        <div className="settings-meta-grid">
                            <div className="settings-meta-item">
                                <span>Config File</span>
                                <strong>{settings.configPath || settings.preferredConfigPath}</strong>
                            </div>
                            <div className="settings-meta-item">
                                <span>Default Folder</span>
                                <strong>{settings.defaultDataDir}</strong>
                            </div>
                        </div>
                        {!settings.configPath && (
                            <p className="muted">No config file is active yet. Saving a custom folder will create one at the preferred config path above.</p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
