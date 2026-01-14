const API_BASE = '/api';

export const api = {
    // Categories
    getCategories: async () => {
        const res = await fetch(`${API_BASE}/categories`);
        return res.json();
    },
    createCategory: async (parent_id, name, color) => {
        const res = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id, name, color })
        });
        return res.json();
    },
    updateCategory: async (id, parent_id, name, color, position) => {
        const res = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id, name, color, position })
        });
        return res.json();
    },
    reorderCategories: async (parent_id, ordered_ids) => {
        const res = await fetch(`${API_BASE}/categories/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id, ordered_ids })
        });
        return res.json();
    },
    archiveCategory: async (id) => {
        const res = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },

    // Tasks
    getTasks: async (filters = {}) => {
        const query = new URLSearchParams(filters).toString();
        const res = await fetch(`${API_BASE}/tasks?${query}`);
        return res.json();
    },
    getTask: async (id) => {
        const res = await fetch(`${API_BASE}/tasks/${id}`);
        return res.json();
    },
    createTask: async (category_id, title, description, url) => {
        const res = await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id, title, description, url })
        });
        return res.json();
    },
    updateTask: async (id, data) => {
        const res = await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    archiveTask: async (id) => {
        const res = await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },
    archiveDoneTasks: async () => {
        const res = await fetch(`${API_BASE}/tasks/archive_done`, { method: 'POST' });
        return res.json();
    },
    reorderTasks: async (status, ordered_ids) => {
        const res = await fetch(`${API_BASE}/tasks/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, ordered_ids })
        });
        return res.json();
    },

    // Todo, Log, Note
    addTodo: async (taskId, text) => {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        return res.json();
    },
    updateTodo: async (id, text, completed) => {
        const res = await fetch(`${API_BASE}/todos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, completed })
        });
        return res.json();
    },
    deleteTodo: async (id) => {
        return fetch(`${API_BASE}/todos/${id}`, { method: 'DELETE' });
    },
    addLog: async (taskId, content) => {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        return res.json();
    },
    addNote: async (taskId, title, content, type) => {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, type })
        });
        return res.json();
    },
    updateNote: async (id, title, content) => {
        const res = await fetch(`${API_BASE}/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        return res.json();
    },
    deleteNote: async (id) => {
        return fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
    },

    // Reports
    getReports: async (startDate, endDate) => {
        const query = new URLSearchParams({ startDate, endDate }).toString();
        const res = await fetch(`${API_BASE}/reports?${query}`);
        return res.json();
    },
    getReportSummary: async (startDate, endDate) => {
        const query = new URLSearchParams({ startDate, endDate }).toString();
        const res = await fetch(`${API_BASE}/reports/summary?${query}`);
        return res.json();
    },

    // Label Notes
    getLabelNotes: async (categoryId, type) => {
        const query = type ? `?type=${type}` : '';
        const res = await fetch(`${API_BASE}/categories/${categoryId}/notes${query}`);
        return res.json();
    },
    addLabelNote: async (categoryId, title, content, type) => {
        const res = await fetch(`${API_BASE}/categories/${categoryId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, type })
        });
        return res.json();
    },
    updateLabelNote: async (id, title, content) => {
        const res = await fetch(`${API_BASE}/label_notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        return res.json();
    },
    deleteLabelNote: async (id) => {
        return fetch(`${API_BASE}/label_notes/${id}`, { method: 'DELETE' });
    },

    // Search
    search: async (q, limit) => {
        const query = new URLSearchParams({ q, ...(limit ? { limit: String(limit) } : {}) }).toString();
        const res = await fetch(`${API_BASE}/search?${query}`);
        return res.json();
    },

    // Weekly status notes
    getWeeklyNote: async (date) => {
        const query = new URLSearchParams(date ? { date } : {}).toString();
        const res = await fetch(`${API_BASE}/weekly_notes${query ? `?${query}` : ''}`);
        return res.json();
    },
    updateWeeklyNote: async (id, content) => {
        const res = await fetch(`${API_BASE}/weekly_notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        return res.json();
    }
};
