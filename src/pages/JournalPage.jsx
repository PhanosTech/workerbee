import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import TiptapEditor from '../components/TiptapEditor';

const dateOnly = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
};

const sortByDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

const mergeEntry = (list, entry) => {
    if (!entry?.date) return list.slice().sort(sortByDateDesc);
    const next = list.filter((item) => item.date !== entry.date);
    next.push(entry);
    next.sort(sortByDateDesc);
    return next;
};

const JournalPage = () => {
    const [entries, setEntries] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [content, setContent] = useState('');
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState('idle');
    const autoSaveRef = useRef(null);
    const isMountedRef = useRef(true);
    const selectedDateRef = useRef('');
    const contentRef = useRef('');

    const getToday = () => new Date().toISOString().split('T')[0];

    useEffect(() => {
        selectedDateRef.current = selectedDate;
    }, [selectedDate]);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    const loadEntry = async (date) => {
        const normalized = dateOnly(date);
        if (!normalized) return;
        try {
            setLoading(true);
            const entry = await api.getJournalEntry(normalized);
            if (!entry) {
                setLoading(false);
                return;
            }
            if (!isMountedRef.current) return;
            setSelectedDate(entry.date);
            setContent(entry.content || '');
            setDirty(false);
            setSaveState('idle');
        } catch (err) {
            console.error(err);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    const ensureTodayEntry = async (currentEntries) => {
        const normalizedToday = dateOnly(getToday());
        const existing = currentEntries.find((entry) => entry.date === normalizedToday);
        if (existing) {
            setSelectedDate(existing.date);
            setContent(existing.content || '');
            setDirty(false);
            setSaveState('idle');
            return currentEntries;
        }

        const baseContent = currentEntries[0]?.content || '';
        const created = await api.upsertJournalEntry(normalizedToday, baseContent);
        const next = mergeEntry(currentEntries, created);
        if (!isMountedRef.current) return next;
        setSelectedDate(created.date);
        setContent(created.content || '');
        setDirty(false);
        setSaveState('idle');
        return next;
    };

    const loadEntries = async () => {
        setLoading(true);
        try {
            const data = await api.getJournalEntries();
            const list = Array.isArray(data) ? data.slice().sort(sortByDateDesc) : [];
            let next = list;
            if (!list.length) {
                const created = await api.upsertJournalEntry(getToday(), '');
                next = [created];
                if (isMountedRef.current) {
                    setSelectedDate(created.date);
                    setContent(created.content || '');
                    setDirty(false);
                    setSaveState('idle');
                }
            } else {
                next = await ensureTodayEntry(list);
            }
            if (isMountedRef.current) setEntries(next);
        } catch (err) {
            console.error(err);
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    const saveNow = async (nextContent = contentRef.current, { silent = false, date } = {}) => {
        const targetDate = dateOnly(date || selectedDateRef.current);
        if (!targetDate) return;
        try {
            if (isMountedRef.current && !silent) setSaveState('saving');
            const saved = await api.upsertJournalEntry(targetDate, nextContent);
            if (!isMountedRef.current || silent) return;
            setEntries((prev) => mergeEntry(prev, saved));
            setDirty(false);
            setSaveState('saved');
        } catch (err) {
            console.error(err);
            if (isMountedRef.current && !silent) setSaveState('error');
        }
    };

    const flushSave = () => {
        if (!dirty) return;
        if (autoSaveRef.current) {
            window.clearTimeout(autoSaveRef.current);
            autoSaveRef.current = null;
        }
        saveNow(contentRef.current, { silent: true });
    };

    useEffect(() => {
        loadEntries();
        return () => {
            flushSave();
            isMountedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!dirty || !selectedDate) return;
        if (autoSaveRef.current) {
            window.clearTimeout(autoSaveRef.current);
        }
        autoSaveRef.current = window.setTimeout(() => {
            saveNow();
        }, 1000);
        return () => {
            if (autoSaveRef.current) {
                window.clearTimeout(autoSaveRef.current);
                autoSaveRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, selectedDate, content]);

    const handleSelectDate = async (event) => {
        const nextDate = dateOnly(event.target.value);
        if (!nextDate || nextDate === selectedDate) return;
        flushSave();
        await loadEntry(nextDate);
    };

    const handleJumpToToday = async () => {
        flushSave();
        const normalizedToday = dateOnly(getToday());
        const existing = entries.find((entry) => entry.date === normalizedToday);
        if (existing) {
            setSelectedDate(existing.date);
            setContent(existing.content || '');
            setDirty(false);
            setSaveState('idle');
            return;
        }
        try {
            const baseContent = entries[0]?.content || '';
            const created = await api.upsertJournalEntry(normalizedToday, baseContent);
            if (!isMountedRef.current) return;
            setEntries((prev) => mergeEntry(prev, created));
            setSelectedDate(created.date);
            setContent(created.content || '');
            setDirty(false);
            setSaveState('idle');
        } catch (err) {
            console.error(err);
        }
    };

    const saveLabel = {
        saving: 'Saving…',
        saved: 'Saved',
        error: 'Save failed',
        idle: dirty ? 'Unsaved changes' : 'All changes saved',
    }[saveState];

    return (
        <div className="journal-page">
            <header className="journal-header">
                <div>
                    <h2 style={{ margin: 0 }}>Journal</h2>
                    <div className="muted" style={{ marginTop: 4 }}>
                        Daily snapshots with a continuous running log.
                    </div>
                </div>
                <div className="journal-controls">
                    <label className="journal-field">
                        <span>Entry</span>
                        <select value={selectedDate} onChange={handleSelectDate} disabled={loading || !entries.length}>
                            {entries.map((entry) => (
                                <option key={entry.date} value={entry.date}>
                                    {entry.date}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="button" onClick={handleJumpToToday} disabled={loading}>
                        Today
                    </button>
                </div>
                <div className="journal-status">{saveLabel}</div>
            </header>
            <section className="journal-editor" aria-label="Journal editor">
                {loading ? (
                    <div className="muted" style={{ padding: 16 }}>Loading…</div>
                ) : (
                    <TiptapEditor
                        content={content}
                        onChange={(html) => {
                            setContent(html);
                            setDirty(true);
                            setSaveState('idle');
                        }}
                        onRequestSave={saveNow}
                        placeholder="Start your daily journal…"
                    />
                )}
            </section>
        </div>
    );
};

export default JournalPage;
