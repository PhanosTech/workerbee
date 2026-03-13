import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

// Mock fs and fs/promises
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

// Set DB_PATH before importing database.ts
const mockDbPath = '/tmp/workbee_test_data';
process.env.DB_PATH = mockDbPath;

import * as db from '../database';

describe('database.ts test suite', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Reset internal state of database.ts for each test
        // Since we can't easily reset module-level variables without re-importing,
        // we'll try to ensure a clean start if possible.
        // For this basic test suite, we'll just handle the shared state.
        
        (fs.existsSync as any).mockReturnValue(false);
        (fsp.readFile as any).mockRejectedValue(new Error('ENOENT'));
    });

    it('should initialize the database', async () => {
        await db.init();
        
        // Check if it tried to create the directory
        expect(fsp.mkdir).toHaveBeenCalled();
        // Check if it wrote the initial state files
        expect(fsp.writeFile).toHaveBeenCalled();
    });

    it('should create and retrieve categories', async () => {
        await db.init();
        const { lastInsertRowid: id } = await db.createCategory(null, 'Work', '#0000ff');
        
        expect(id).toBeDefined();
        const categories = await db.getCategories();
        const workCat = categories.find(c => c.name === 'Work');
        expect(workCat).toBeDefined();
        expect(workCat?.color).toBe('#0000ff');
    });

    it('should create and retrieve tasks', async () => {
        await db.init();
        const categories = await db.getCategories();
        const workCat = categories.find(c => c.name === 'Work');
        const catId = workCat ? workCat.id : null;

        const { lastInsertRowid: taskId } = await db.createTask(catId, 'First Task', 'Description', 'http://example.com');
        
        expect(taskId).toBeDefined();
        const tasks = await db.getAllTasks();
        const task = tasks.find(t => t.title === 'First Task');
        expect(task).toBeDefined();
        expect(task?.category_id).toBe(catId);
        expect(task?.description).toBe('Description');
    });

    it('should verify JSON splitting logic (separate files written)', async () => {
        await db.init();
        
        // Clear mocks to only see persist() calls from next operation
        vi.clearAllMocks();
        
        await db.createCategory(null, 'New Category', null);
        
        // persist() is called after createCategory
        // it iterates over state keys and writes to ${key}.json
        const writeCalls = (fsp.writeFile as any).mock.calls;
        const writtenFiles = writeCalls.map((call: any) => path.basename(call[0]));
        
        // Check if some expected files are present
        expect(writtenFiles).toContain('categories.json.tmp');
        expect(writtenFiles).toContain('tasks.json.tmp');
        expect(writtenFiles).toContain('meta.json.tmp');
        
        // The atomicWriteFile uses rename to move .tmp to .json
        const renameCalls = (fsp.rename as any).mock.calls;
        const renamedToFiles = renameCalls.map((call: any) => path.basename(call[1]));
        
        expect(renamedToFiles).toContain('categories.json');
        expect(renamedToFiles).toContain('tasks.json');
        expect(renamedToFiles).toContain('meta.json');
    });

    it('should timestamp task notes and allow task worklog edits', async () => {
        await db.init();

        const { lastInsertRowid: taskId } = await db.createTask(null, 'Timestamped Task', null, null);
        const { lastInsertRowid: noteId } = await db.addNote(Number(taskId), 'Inbox', '<p>Saved note</p>', 'rich_text');
        const createdNote = await db.getTaskNote(Number(noteId));

        expect(createdNote?.created_at).toBeDefined();
        expect(createdNote?.updated_at).toBeDefined();

        const { lastInsertRowid: logId } = await db.addLog(Number(taskId), 'Initial work');
        await db.updateLog(Number(logId), 'Edited work');
        let logs = await db.getTaskLogs(Number(taskId));
        expect(logs.find((log) => log.id === Number(logId))?.content).toBe('Edited work');

        await db.deleteLog(Number(logId));
        logs = await db.getTaskLogs(Number(taskId));
        expect(logs.find((log) => log.id === Number(logId))).toBeUndefined();
    });

    it('should return searchable thread notes with editable dates and topic worklog edits', async () => {
        await db.init();

        const { lastInsertRowid: topicId } = await db.createTopic('Email Thread', 'Follow-up thread', 'BACKLOG', 'email');
        const { lastInsertRowid: noteId } = await db.addTopicNote(Number(topicId), 'Thread recap', '<p>Summary</p>', 'rich_text');
        const topicNotes = await db.getAllTopicNotes();
        const createdNote = topicNotes.find((note) => note.id === Number(noteId));

        expect(createdNote?.created_at).toBeDefined();
        expect(createdNote?.topic_title).toBe('Email Thread');

        await db.updateTopicNote(Number(noteId), 'Thread recap', '<p>Late import from inbox</p>', '2024-01-15');
        const datedNotes = await db.getAllTopicNotes({ startDate: '2024-01-15', endDate: '2024-01-15' });
        const editedNote = datedNotes.find((note) => note.id === Number(noteId));
        expect(editedNote?.created_at.startsWith('2024-01-15')).toBe(true);

        const searchResults = await db.search('late import inbox', 10);
        expect(searchResults.some((result) => result.type === 'thread' && result.id === Number(topicId))).toBe(true);

        const { lastInsertRowid: logId } = await db.addTopicLog(Number(topicId), 'Logged work');
        await db.updateTopicLog(Number(logId), 'Updated topic work');
        let logs = await db.getTopicLogs(Number(topicId));
        expect(logs.find((log) => log.id === Number(logId))?.content).toBe('Updated topic work');

        await db.deleteTopicLog(Number(logId));
        logs = await db.getTopicLogs(Number(topicId));
        expect(logs.find((log) => log.id === Number(logId))).toBeUndefined();
    });
});
