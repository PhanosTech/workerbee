export interface Category {
    id: number;
    parent_id: number | null;
    name: string;
    color: string | null;
    position: number;
    archived: number;
    task_count?: number;
    task_count_total?: number;
}

export interface ExternalLink {
    label: string;
    url: string;
}

export interface Task {
    id: number;
    category_id: number | null;
    title: string;
    description: string | null;
    url: string | null;
    links?: ExternalLink[];
    task_type: string;
    story_points: number;
    priority: string;
    status: string;
    board_position: number;
    list_position?: number;
    archived: number;
    archived_at: string | null;
    created_at: string;
    started_at: string | null;
    doing_at: string | null;
    done_at: string | null;
    due_date?: string | null;
    updated_at?: string;
    todo_total?: number;
    todo_completed?: number;
    category_name?: string | null;
    category_color?: string | null;
    // Detailed view fields
    todos?: Todo[];
    logs?: Log[];
    notes?: Note[];
}

export interface Todo {
    id: number;
    task_id: number;
    text: string;
    completed: number;
    position: number;
}

export interface Log {
    id: number;
    task_id: number;
    content: string | null;
    timestamp: string;
    task_title?: string | null;
    category_name?: string | null;
}

export interface ReportLog extends Log {
    topic_id?: number;
    topic_title?: string | null;
}

export interface Note {
    id: number;
    task_id: number;
    title: string | null;
    content: string | null;
    type: string;
    created_at: string;
    updated_at: string;
}

export interface LabelNote {
    id: number;
    category_id: number;
    title: string | null;
    content: string | null;
    type: string;
    created_at: string;
    updated_at: string;
    archived: number;
    archived_at: string | null;
    category_name?: string | null;
    category_color?: string | null;
}

export interface WeeklyNote {
    id: number;
    week_start: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface JournalEntry {
    id: number;
    date: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface Topic {
    id: number;
    title: string;
    description: string;
    status: string;
    tags: string;
    links?: ExternalLink[];
    category_ids?: number[];
    category_labels?: string[];
    thread_date?: string | null;
    position?: number;
    archived: number;
    archived_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface TaskNote extends Note {
    category_id: number | null;
    task_title: string | null;
    task_status: string | null;
    task_archived: number;
}

export interface TopicTodo {
    id: number;
    topic_id: number;
    text: string;
    completed: number;
    created_at: string;
}

export interface TopicLog {
    id: number;
    topic_id: number;
    content: string | null;
    timestamp: string;
    topic_title?: string | null;
}

export interface TopicNote {
    id: number;
    topic_id: number;
    title: string | null;
    content: string | null;
    type: string;
    created_at: string;
    updated_at: string;
    topic_title?: string | null;
    topic_status?: string | null;
}

export interface SearchResult {
    type: 'task' | 'note' | 'weekly' | 'thread';
    id: number;
    title: string;
    status?: string | null;
    category_id?: number | null;
    week_start?: string | null;
    updated_at: string | null;
    snippet: string;
}

export interface ReportSummary {
    startDate: string;
    endDate: string;
    logs: ReportLog[];
    completedTasks: Task[];
}

export interface ArchiveData {
    startDate: string;
    endDate: string;
    tasks: Task[];
    notes: LabelNote[];
}

export interface ChangesResponse {
    changes: number;
    lastInsertRowid?: number;
}

export type DataDirSource = 'env' | 'config' | 'default' | 'legacy-local' | 'legacy-roaming' | 'legacy-exe';

export interface DataDirectoryInspection {
    normalizedPath: string;
    exists: boolean;
    willCreateDirectory: boolean;
    hasExistingData: boolean;
    dataFiles: string[];
}

export interface StorageSettings {
    dataDir: string;
    dataDirSource: DataDirSource;
    defaultDataDir: string;
    configPath: string | null;
    preferredConfigPath: string;
    hasExistingData: boolean;
    dataFiles: string[];
    envOverrideActive: boolean;
    isDev: boolean;
}

export interface SetDataDirectoryResult extends StorageSettings {
    changed: boolean;
    createdDirectory: boolean;
    loadedExistingData: boolean;
    startedFresh: boolean;
}

export interface TaskFilters {
    status?: string;
    statuses?: string[];
    category_id?: number;
    include_descendants?: boolean | string;
    archived?: 'exclude' | 'only' | 'include' | boolean | string;
}

declare global {
    interface Window {
        electronAPI: {
            invoke: (channel: string, data?: any) => Promise<any>;
            openExternal: (url: string) => void;
        };
    }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

const invoke = async <T>(channel: string, data?: any): Promise<T> => {
    if (isElectron) {
        return window.electronAPI.invoke(channel, data);
    }
    console.error('Electron IPC not available for:', channel);
    throw new Error('Electron IPC not available');
};

export const api = {
    // Storage settings
    getStorageSettings: (): Promise<StorageSettings> => invoke('getStorageSettings'),
    selectDataDirectory: (): Promise<string | null> => invoke('selectDataDirectory'),
    inspectDataDirectory: (dataDir: string): Promise<DataDirectoryInspection> => invoke('inspectDataDirectory', dataDir),
    setDataDirectory: (dataDir: string): Promise<SetDataDirectoryResult> => invoke('setDataDirectory', { dataDir }),

    // Categories
    getCategories: (): Promise<Category[]> => invoke('getCategories'),
    createCategory: (parent_id: number | null, name: string, color: string | null): Promise<ChangesResponse> => 
        invoke('createCategory', { parent_id, name, color }),
    updateCategory: (id: number, parent_id: number | null, name: string, color: string | null, position?: number | null): Promise<ChangesResponse> => 
        invoke('updateCategory', { id, parent_id, name, color, position }),
    reorderCategories: (parent_id: number | null, ordered_ids: (number | string)[]): Promise<{ ok: boolean }> => 
        invoke('reorderCategories', { parent_id, ordered_ids }),
    archiveCategory: (id: number): Promise<{ ok: boolean }> => invoke('archiveCategory', id),

    // Tasks
    getTasks: (filters: TaskFilters = {}): Promise<Task[]> => invoke('getTasks', filters),
    getTask: (id: number): Promise<Task | null> => invoke('getTask', id),
    getNote: (id: number): Promise<TaskNote | null> => invoke('getNote', id),
    createTask: (category_id: number | null, title: string, description: string | null, url: string | null, links?: ExternalLink[]): Promise<ChangesResponse> => 
        invoke('createTask', { category_id, title, description, url, links }),
    updateTask: (id: number, data: Partial<Task>): Promise<ChangesResponse> => invoke('updateTask', { id, data }),
    archiveTask: (id: number): Promise<ChangesResponse> => invoke('archiveTask', id),
    archiveDoneTasks: (): Promise<ChangesResponse> => invoke('archiveDoneTasks'),
    reorderTasks: (status: string, ordered_ids: (number | string)[]): Promise<{ ok: boolean }> => 
        invoke('reorderTasks', { status, ordered_ids }),
    reorderTasksInCategory: (categoryId: number, ordered_ids: (number | string)[]): Promise<{ ok: boolean }> => 
        invoke('reorderTasksInCategory', { categoryId, ordered_ids }),

    // Todo, Log, Note
    addTodo: (taskId: number, text: string): Promise<ChangesResponse> => invoke('addTodo', { taskId, text }),
    updateTodo: (id: number, text: string, completed: boolean | number): Promise<ChangesResponse> => 
        invoke('updateTodo', { id, text, completed }),
    reorderTodos: (taskId: number, ordered_ids: (number | string)[]): Promise<{ ok: boolean }> => 
        invoke('reorderTodos', { taskId, ordered_ids }),
    deleteTodo: (id: number): Promise<ChangesResponse> => invoke('deleteTodo', id),
    addLog: (taskId: number, content: string | null): Promise<ChangesResponse> => invoke('addLog', { taskId, content }),
    updateLog: (id: number, content: string | null): Promise<ChangesResponse> => invoke('updateLog', { id, content }),
    deleteLog: (id: number): Promise<ChangesResponse> => invoke('deleteLog', id),
    addNote: (taskId: number, title: string | null, content: string | null, type: string): Promise<ChangesResponse> => 
        invoke('addNote', { taskId, title, content, type }),
    updateNote: (id: number, title: string | null, content: string | null): Promise<ChangesResponse> => 
        invoke('updateNote', { id, title, content }),
    deleteNote: (id: number): Promise<ChangesResponse> => invoke('deleteNote', id),
    getTaskNotes: (taskId: number): Promise<Note[]> => invoke('getTaskNotes', taskId),

    // Reports
    getReports: (startDate: string, endDate: string): Promise<ReportLog[]> => invoke('getReports', { startDate, endDate }),
    getReportSummary: (startDate: string, endDate: string): Promise<ReportSummary> => 
        invoke('getReportSummary', { startDate, endDate }),
    getArchive: (startDate: string, endDate: string, weeks?: number | string): Promise<ArchiveData> => 
        invoke('getArchive', { startDate, endDate, weeks }),

    // Label Notes
    getLabelNotes: (categoryId: number, type?: string | null): Promise<LabelNote[]> => 
        invoke('getLabelNotes', { categoryId, type }),
    addLabelNote: (categoryId: number, title: string | null, content: string | null, type: string): Promise<ChangesResponse> => 
        invoke('addLabelNote', { categoryId, title, content, type }),
    updateLabelNote: (id: number, title: string | null, content: string | null): Promise<ChangesResponse> => 
        invoke('updateLabelNote', { id, title, content }),
    deleteLabelNote: (id: number): Promise<ChangesResponse> => invoke('deleteLabelNote', id),
    getLabelNote: (id: number): Promise<LabelNote | null> => invoke('getLabelNote', id),
    archiveLabelNote: (id: number): Promise<ChangesResponse> => invoke('archiveLabelNote', id),
    unarchiveLabelNote: (id: number): Promise<ChangesResponse> => invoke('unarchiveLabelNote', id),

    // Search
    search: (q: string, limit?: number): Promise<SearchResult[]> => invoke('search', { q, limit }),

    // Weekly status notes
    getWeeklyNote: (date: string): Promise<WeeklyNote> => invoke('getWeeklyNote', date),
    updateWeeklyNote: (id: number, content: string): Promise<{ changes: number, note: WeeklyNote }> => 
        invoke('updateWeeklyNote', { id, content }),

    // Journal
    getJournalEntries: (): Promise<JournalEntry[]> => invoke('getJournalEntries'),
    getLatestJournalEntry: (): Promise<JournalEntry | null> => invoke('getLatestJournalEntry'),
    getJournalEntry: (date: string): Promise<JournalEntry | null> => invoke('getJournalEntry', date),
    upsertJournalEntry: (date: string, content: string): Promise<{ changes: number, entry: JournalEntry }> => 
        invoke('upsertJournalEntry', { date, content }),

    // Topics
    getTopics: (filters: { statuses?: string[]; archived?: 'exclude' | 'only' | 'include' | boolean | string } = {}): Promise<Topic[]> => invoke('getTopics', filters),
    getTopic: (id: number): Promise<Topic | null> => invoke('getTopic', id),
    createTopic: (topic: Partial<Topic>): Promise<ChangesResponse> => invoke('createTopic', topic),
    updateTopic: (id: number, topic: Partial<Topic>): Promise<ChangesResponse> => invoke('updateTopic', { id, topic }),
    reorderTopics: (ordered_ids: (number | string)[]): Promise<{ ok: boolean }> => invoke('reorderTopics', ordered_ids),
    archiveTopic: (id: number): Promise<ChangesResponse> => invoke('archiveTopic', id),
    deleteTopic: (id: number): Promise<ChangesResponse> => invoke('deleteTopic', id),

    // Topic sub-resources
    getTopicTodos: (id: number): Promise<TopicTodo[]> => invoke('getTopicTodos', id),
    addTopicTodo: (id: number, text: string): Promise<ChangesResponse> => invoke('addTopicTodo', { id, text }),
    updateTopicTodo: (id: number, text: string, completed: boolean | number): Promise<ChangesResponse> => 
        invoke('updateTopicTodo', { id, text, completed }),
    deleteTopicTodo: (id: number): Promise<ChangesResponse> => invoke('deleteTopicTodo', id),
    getTopicLogs: (id: number): Promise<TopicLog[]> => invoke('getTopicLogs', id),
    addTopicLog: (id: number, content: string | null): Promise<ChangesResponse> => invoke('addTopicLog', { id, content }),
    updateTopicLog: (id: number, content: string | null): Promise<ChangesResponse> => invoke('updateTopicLog', { id, content }),
    deleteTopicLog: (id: number): Promise<ChangesResponse> => invoke('deleteTopicLog', id),
    getTopicNotes: (id: number): Promise<TopicNote[]> => invoke('getTopicNotes', id),
    getAllTopicNotes: (filters: { startDate?: string | null; endDate?: string | null; archived?: 'exclude' | 'only' | 'include' | boolean | string } = {}): Promise<TopicNote[]> =>
        invoke('getAllTopicNotes', filters),
    addTopicNote: (id: number, title: string | null, content: string | null, type: string): Promise<ChangesResponse> => 
        invoke('addTopicNote', { id, title, content, type }),
    updateTopicNote: (id: number, title: string | null, content: string | null, created_at?: string | null): Promise<ChangesResponse> => 
        invoke('updateTopicNote', { id, title, content, created_at }),
    deleteTopicNote: (id: number): Promise<ChangesResponse> => invoke('deleteTopicNote', id),

    // Task-Topic links
    getTaskTopics: (taskId: number): Promise<Topic[]> => invoke('getTaskTopics', taskId),
    setTaskTopics: (taskId: number, topicIds: (number | string)[]): Promise<{ ok: boolean }> => 
        invoke('setTaskTopics', { taskId, topicIds }),
    getTopicTasks: (topicId: number): Promise<Task[]> => invoke('getTopicTasks', topicId),
    setTopicTasks: (topicId: number, taskIds: (number | string)[]): Promise<{ ok: boolean }> =>
        invoke('setTopicTasks', { topicId, taskIds }),

    // Hard delete task
    hardDeleteTask: (id: number): Promise<{ ok: boolean }> => invoke('hardDeleteTask', id)
};
