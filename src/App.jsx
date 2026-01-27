import React, { useEffect, useState } from 'react';
import TopNav from './components/TopNav';
import ActivePage from './pages/ActivePage';
import ReportsPage from './pages/ReportsPage';
import BacklogPage from './pages/BacklogPage';
import NotesPage from './pages/NotesPage';
import WeeklyStatusPage from './pages/WeeklyStatusPage';
import JournalPage from './pages/JournalPage';
import SearchModal from './components/SearchModal';
import './styles/main.css';

const VALID_THEMES = new Set(['midnight', 'graphite', 'ocean', 'ember', 'amethyst', 'nord', 'forest', 'light']);

const getInitialTheme = () => {
    if (typeof window === 'undefined') return 'midnight';
    const saved = window.localStorage.getItem('wb-theme');
    if (saved && VALID_THEMES.has(saved)) return saved;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
    return prefersLight ? 'light' : 'midnight';
};

function App() {
    const [activeTab, setActiveTab] = useState('kanban');
    const [backlogFocus, setBacklogFocus] = useState(null); // { taskId, categoryId, nonce }
    const [notesFocus, setNotesFocus] = useState(null); // { noteId, nonce }
    const [weeklyFocus, setWeeklyFocus] = useState(null); // { date, nonce }
    const [theme, setTheme] = useState(getInitialTheme);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        const parseHash = () => {
            const hash = String(window.location.hash || '').replace(/^#/, '');
            const match = hash.match(/^\/notes\/(\d+)\s*$/);
            if (match) {
                const noteId = Number(match[1]);
                setActiveTab('notes');
                setNotesFocus({ noteId, nonce: Date.now() });
            }
        };

        parseHash();
        window.addEventListener('hashchange', parseHash);
        return () => window.removeEventListener('hashchange', parseHash);
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
        window.localStorage.setItem('wb-theme', theme);
    }, [theme]);

    const openTaskInBacklog = (task) => {
        if (!task?.id) return;
        setBacklogFocus({
            taskId: task.id,
            categoryId: task.category_id ?? null,
            nonce: Date.now(),
        });
        setActiveTab('backlog');
    };

    const openSearch = () => setSearchOpen(true);

    const handleSearchSelect = (result) => {
        if (!result) return;
        if (result.type === 'task') {
            openTaskInBacklog({ id: result.id, category_id: result.category_id ?? null });
            return;
        }
        if (result.type === 'note') {
            setActiveTab('notes');
            setNotesFocus({ noteId: result.id, nonce: Date.now() });
            return;
        }
        if (result.type === 'weekly') {
            setActiveTab('weekly');
            setWeeklyFocus({ date: result.week_start || '', nonce: Date.now() });
        }
    };

    return (
        <div className="app-container">
            <TopNav activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} setTheme={setTheme} />
            <main className={`content ${activeTab === 'notes' ? 'content-notes' : ''}`} role="main">
                {activeTab === 'kanban' && <ActivePage onOpenInBacklog={openTaskInBacklog} />}
                {activeTab === 'weekly' && <WeeklyStatusPage focus={weeklyFocus} />}
                {activeTab === 'notes' && <NotesPage focus={notesFocus} onOpenSearch={openSearch} />}
                {activeTab === 'backlog' && <BacklogPage focus={backlogFocus} onOpenSearch={openSearch} />}
                {activeTab === 'reports' && <ReportsPage />}
                {activeTab === 'journal' && <JournalPage />}
            </main>

            <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />
        </div>
    );
}

export default App;
