import React, { useEffect, useState } from 'react';
import TopNav from './components/TopNav';
import ActivePage from './pages/ActivePage';
import ReportsPage from './pages/ReportsPage';
import BacklogPage from './pages/BacklogPage';
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
    const [activeTab, setActiveTab] = useState('active');
    const [backlogFocus, setBacklogFocus] = useState(null); // { taskId, categoryId, nonce }
    const [theme, setTheme] = useState(getInitialTheme);

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

    return (
        <div className="app-container">
            <TopNav activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} setTheme={setTheme} />
            <main className="content" role="main">
                {activeTab === 'active' && <ActivePage onOpenInBacklog={openTaskInBacklog} />}
                {activeTab === 'backlog' && <BacklogPage focus={backlogFocus} />}
                {activeTab === 'reports' && <ReportsPage />}
            </main>
        </div>
    );
}

export default App;
