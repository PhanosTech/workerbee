import React from 'react';

interface TopNavProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    theme: string;
    setTheme: (theme: any) => void;
}

const TopNav: React.FC<TopNavProps> = ({ activeTab, setActiveTab, theme, setTheme }) => {
    return (
        <header className="topbar">
            <div className="topbar-left">
                <div className="topbar-title">WorkerBee</div>
            </div>

            <nav className="topbar-nav" aria-label="Primary">
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'journal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('journal')}
                >
                    Logs
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'topics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('topics')}
                >
                    Topics
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'kanban' ? 'active' : ''}`}
                    onClick={() => setActiveTab('kanban')}
                >
                    Kanban
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'backlog' ? 'active' : ''}`}
                    onClick={() => setActiveTab('backlog')}
                >
                    Backlog
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                >
                    Notes
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reports')}
                >
                    Reports
                </button>
                <button
                    type="button"
                    className={`topbar-tab ${activeTab === 'weekly' ? 'active' : ''}`}
                    onClick={() => setActiveTab('weekly')}
                >
                    Weekly
                </button>
            </nav>

            <div className="topbar-right">
                <label className="theme-switcher">
                    <span className="theme-switcher-label">Theme</span>
                    <select
                        className="theme-select"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        aria-label="Theme"
                    >
                        <option value="midnight">Midnight</option>
                        <option value="graphite">Graphite</option>
                        <option value="ocean">Ocean</option>
                        <option value="ember">Ember</option>
                        <option value="amethyst">Amethyst</option>
                        <option value="nord">Nord</option>
                        <option value="forest">Forest</option>
                        <option value="light">Light</option>
                    </select>
                </label>
            </div>
        </header>
    );
};

export default TopNav;
