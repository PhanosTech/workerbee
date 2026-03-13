const ipcMain = {
    handle: (name, cb) => {
        const id = 1;
        const data = { status: 'DOING' };
        cb({}, { id, data });
    }
};

ipcMain.handle('updateTask', (_e, { id, data }) => {
    console.log("title is:", data.title);
    console.log("type of title is:", typeof data.title);
});
