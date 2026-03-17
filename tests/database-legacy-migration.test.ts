import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    default: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
    }
}));

vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    default: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(undefined),
        rm: vi.fn().mockResolvedValue(undefined),
    }
}));

describe('legacy database migration', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        delete process.env.WORKERBEE_LEGACY_DB_PATHS;
        delete process.env.DB_PATH;
        (fs.existsSync as any).mockReturnValue(false);
        (fsp.readFile as any).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    it('migrates a legacy workbee.json into the split workbee_data store on first init', async () => {
        const dbDirPath = path.join('/tmp', 'WorkerBee', 'workbee_data');
        const legacyFilePath = path.join('/tmp', 'win-unpacked', 'workbee.json');

        process.env.DB_PATH = dbDirPath;
        process.env.WORKERBEE_LEGACY_DB_PATHS = legacyFilePath;

        (fs.existsSync as any).mockImplementation((filePath: string) => path.normalize(filePath) === path.normalize(legacyFilePath));
        (fsp.readFile as any).mockImplementation(async (filePath: string) => {
            if (path.normalize(filePath) === path.normalize(legacyFilePath)) {
                return JSON.stringify({
                    tasks: [
                        {
                            id: 1,
                            category_id: null,
                            title: 'Legacy task',
                            description: 'Migrated from workbee.json',
                            url: null,
                            task_type: 'NONE',
                            story_points: 0,
                            priority: 'NORMAL',
                            status: 'BACKLOG',
                            board_position: 0,
                            archived: 0,
                            archived_at: null,
                            created_at: '2026-01-01T00:00:00.000Z',
                            started_at: null,
                            doing_at: null,
                            done_at: null,
                        },
                    ],
                });
            }
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        });

        const db = await import('../database');
        await db.init();

        expect(fsp.readFile).toHaveBeenCalledWith(legacyFilePath, 'utf8');
        expect(
            (fsp.rename as any).mock.calls.some((call: any[]) =>
                path.normalize(call[0]) === path.normalize(legacyFilePath) &&
                String(call[1]).startsWith(`${legacyFilePath}.bak`)
            )
        ).toBe(true);
        expect(
            (fsp.writeFile as any).mock.calls.some((call: any[]) =>
                path.normalize(call[0]) === path.normalize(path.join(dbDirPath, 'tasks.json.tmp'))
            )
        ).toBe(true);

        const tasks = await db.getAllTasks();
        expect(tasks.some((task) => task.title === 'Legacy task')).toBe(true);
    });

    it('prefers the legacy workbee.json over an empty split store created by a prior first run', async () => {
        const dbDirPath = path.join('/tmp', 'WorkerBee', 'workbee_data');
        const legacyFilePath = path.join('/tmp', 'win-unpacked', 'workbee.json');
        const metaFilePath = path.join(dbDirPath, 'meta.json');

        process.env.DB_PATH = dbDirPath;
        process.env.WORKERBEE_LEGACY_DB_PATHS = legacyFilePath;

        (fs.existsSync as any).mockImplementation((filePath: string) => {
            const normalized = path.normalize(filePath);
            return normalized === path.normalize(legacyFilePath) || normalized === path.normalize(metaFilePath);
        });
        (fsp.readFile as any).mockImplementation(async (filePath: string) => {
            const normalized = path.normalize(filePath);
            if (normalized === path.normalize(metaFilePath)) {
                return JSON.stringify({
                    version: 1,
                    lastId: {
                        categories: 0,
                        tasks: 0,
                        todos: 0,
                        logs: 0,
                        notes: 0,
                        label_notes: 0,
                        weekly_notes: 0,
                        journal_entries: 0,
                        topics: 0,
                        topic_todos: 0,
                        topic_logs: 0,
                        topic_notes: 0,
                        task_topics: 0,
                    },
                });
            }
            if (normalized === path.normalize(legacyFilePath)) {
                return JSON.stringify({
                    tasks: [
                        {
                            id: 2,
                            category_id: null,
                            title: 'Imported after empty init',
                            description: null,
                            url: null,
                            task_type: 'NONE',
                            story_points: 0,
                            priority: 'NORMAL',
                            status: 'BACKLOG',
                            board_position: 0,
                            archived: 0,
                            archived_at: null,
                            created_at: '2026-01-02T00:00:00.000Z',
                            started_at: null,
                            doing_at: null,
                            done_at: null,
                        },
                    ],
                });
            }
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        });

        const db = await import('../database');
        await db.init();

        const tasks = await db.getAllTasks();
        expect(tasks.some((task) => task.title === 'Imported after empty init')).toBe(true);
        expect(
            (fsp.rename as any).mock.calls.some((call: any[]) =>
                path.normalize(call[0]) === path.normalize(legacyFilePath)
            )
        ).toBe(true);
    });
});
