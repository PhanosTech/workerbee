import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, SearchResult } from '../api';

interface SearchModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (result: SearchResult) => void;
}

const iconForType = (type: string) => {
    if (type === 'task') return '✅';
    if (type === 'note') return '📝';
    if (type === 'weekly') return '📅';
    return '🔎';
};

const labelForType = (type: string) => {
    if (type === 'task') return 'Task';
    if (type === 'note') return 'Note';
    if (type === 'weekly') return 'Weekly';
    return 'Result';
};

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose, onSelect }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = query.trim();

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setResults([]);
        setActiveIndex(0);
        setLoading(false);
        setError(null);
        const raf = window.requestAnimationFrame(() => inputRef.current?.focus?.());
        return () => window.cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (!trimmed) {
            setResults([]);
            setActiveIndex(0);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        const handle = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await api.search(trimmed, 80);
                if (cancelled) return;
                setResults(Array.isArray(data) ? data : []);
                setActiveIndex(0);
            } catch (err) {
                if (cancelled) return;
                setResults([]);
                setError('Search failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [open, trimmed]);

    const selectable = useMemo(() => (Array.isArray(results) ? results : []), [results]);

    const clampIndex = (value: number) => {
        if (!selectable.length) return 0;
        return Math.max(0, Math.min(selectable.length - 1, value));
    };

    useEffect(() => {
        setActiveIndex((idx) => clampIndex(idx));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectable.length]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay search-modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                onClose?.();
            }}
        >
            <div className="modal-content search-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header search-modal-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>Search</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                            Tasks, notes, and weekly status
                        </div>
                    </div>
                    <button type="button" className="close-btn" onClick={() => onClose?.()}>
                        &times;
                    </button>
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    placeholder="Type to search…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            onClose?.();
                            return;
                        }
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveIndex((idx) => clampIndex(idx + 1));
                            return;
                        }
                        if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveIndex((idx) => clampIndex(idx - 1));
                            return;
                        }
                        if (e.key === 'Enter') {
                            if (!selectable.length) return;
                            e.preventDefault();
                            const selected = selectable[clampIndex(activeIndex)];
                            if (!selected) return;
                            onSelect?.(selected);
                            onClose?.();
                        }
                    }}
                    autoComplete="off"
                />

                <div className="search-results">
                    {loading && <div className="search-hint">Searching…</div>}
                    {!loading && error && <div className="search-hint error">{error}</div>}
                    {!loading && !error && !trimmed && (
                        <div className="search-hint">Start typing to search tasks and notes.</div>
                    )}
                    {!loading && !error && trimmed && selectable.length === 0 && (
                        <div className="search-hint">No results.</div>
                    )}

                    {selectable.length > 0 && (
                        <ul className="search-results-list" role="listbox" aria-label="Search results">
                            {selectable.map((r, idx) => (
                                <li key={`${r.type}-${r.id}`} role="option" aria-selected={idx === activeIndex}>
                                    <button
                                        type="button"
                                        className={`search-result ${idx === activeIndex ? 'active' : ''}`}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        onClick={() => {
                                            onSelect?.(r);
                                            onClose?.();
                                        }}
                                    >
                                        <span className="search-result-icon" aria-hidden="true">
                                            {iconForType(r.type)}
                                        </span>
                                        <span className="search-result-body">
                                            <span className="search-result-top">
                                                <span className="search-result-title">{r.title || 'Untitled'}</span>
                                                <span className="search-result-tag">{labelForType(r.type)}</span>
                                            </span>
                                            {r.snippet ? <span className="search-result-snippet">{r.snippet}</span> : null}
                                            {r.type === 'task' && r.status ? (
                                                <span className="search-result-meta">Status: {r.status}</span>
                                            ) : null}
                                            {r.type === 'weekly' && r.week_start ? (
                                                <span className="search-result-meta">Week of {r.week_start}</span>
                                            ) : null}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SearchModal;
