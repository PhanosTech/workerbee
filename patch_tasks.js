const fs = require('fs');
let db = fs.readFileSync('database.ts', 'utf8');

const newFunc = `export const reorderTasksInCategory = async (categoryId: number, orderedIds: (number | string)[]) => {
    return withWriteLock(async () => {
        const st = getState();
        const cid = Number(categoryId);
        orderedIds.forEach((rawId, idx) => {
            const id = Number(rawId);
            const task = st.tasks.find((t) => Number(t.id) === id);
            if (!task || task.archived || Number(task.category_id) !== cid) return;
            task.board_position = idx;
        });
        await persist();
        return { ok: true };
    });
};

`;
db = db.replace('export const archiveTask =', newFunc + 'export const archiveTask =');
fs.writeFileSync('database.ts', db);

let api = fs.readFileSync('src/api.ts', 'utf8');
api = api.replace(/reorderTasks: \(([^)]+)\) => Promise<\{ ok: boolean \}>;/g, `reorderTasks: (status: string, ordered_ids: (number | string)[]) => Promise<{ ok: boolean }>;
    reorderTasksInCategory: (categoryId: number, ordered_ids: (number | string)[]) => Promise<{ ok: boolean }>;`);
api = api.replace(/reorderTasks: \(([^)]+)\) => \n\s*invoke\('reorderTasks', \{ status, ordered_ids \}\),/g, `reorderTasks: (status: string, ordered_ids: (number | string)[]) => 
        invoke('reorderTasks', { status, ordered_ids }),
    reorderTasksInCategory: (categoryId: number, ordered_ids: (number | string)[]) => 
        invoke('reorderTasksInCategory', { categoryId, ordered_ids }),`);
fs.writeFileSync('src/api.ts', api);

let main = fs.readFileSync('electron/main.ts', 'utf8');
main = main.replace(/ipcMain\.handle\('reorderTasks', ([^\)]+)\) => db\.reorderTasksInStatus\(status, ordered_ids\)\);/g, `ipcMain.handle('reorderTasks', (_e: IpcMainInvokeEvent, { status, ordered_ids }: { status: string, ordered_ids: (number | string)[] }) => db.reorderTasksInStatus(status, ordered_ids));
    ipcMain.handle('reorderTasksInCategory', (_e: IpcMainInvokeEvent, { categoryId, ordered_ids }: { categoryId: number, ordered_ids: (number | string)[] }) => db.reorderTasksInCategory(categoryId, ordered_ids));`);
fs.writeFileSync('electron/main.ts', main);
