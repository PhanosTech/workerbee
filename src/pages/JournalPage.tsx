import React, { useEffect, useRef, useState } from 'react';
import { api, JournalEntry } from '../api';
import TiptapEditor from '../components/TiptapEditor';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const dateOnly = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
};

const sortByDateDesc = (a: JournalEntry, b: JournalEntry) => String(b.date || '').localeCompare(String(a.date || ''));

const mergeEntry = (list: JournalEntry[], entry: JournalEntry) => {
    if (!entry?.date) return list.slice().sort(sortByDateDesc);
    const next = list.filter((item) => item.date !== entry.date);
    next.push(entry);
    next.sort(sortByDateDesc);
    return next;
};

const JournalPage: React.FC = () => {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [content, setContent] = useState<string>('');
    const [dirty, setDirty] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [error, setError] = useState<string | null>(null);
    const autoSaveRef = useRef<number | null>(null);
    const isMountedRef = useRef<boolean>(true);
    const selectedDateRef = useRef<string>('');
    const contentRef = useRef<string>('');

    const getToday = () => new Date().toISOString().split('T')[0];
    const fallbackDate = () => dateOnly(getToday());

    const withTimeout = <T,>(promise: Promise<T>, ms = 6000): Promise<T> =>
        new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Request timeout')), ms);
            promise
                .then((value) => {
                    window.clearTimeout(timer);
                    resolve(value);
                })
                .catch((err) => {
                    window.clearTimeout(timer);
                    reject(err);
                });
        });

    useEffect(() => {
        selectedDateRef.current = selectedDate;
    }, [selectedDate]);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    const loadEntry = async (date: string) => {
        const normalized = dateOnly(date);
        if (!normalized) return;
        try {
            setLoading(true);
            setError(null);
            const entry = await withTimeout(api.getJournalEntry(normalized));
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
            if (isMountedRef.current) setError('Failed to load logs');
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    const ensureTodayEntry = async (currentEntries: JournalEntry[]) => {
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
        const created = await withTimeout(api.upsertJournalEntry(normalizedToday, baseContent));
        const next = mergeEntry(currentEntries, created.entry);
        if (!isMountedRef.current) return next;
        setSelectedDate(created.entry.date);
        setContent(created.entry.content || '');
        setDirty(false);
        setSaveState('idle');
        return next;
    };

    const loadEntries = async () => {
        setLoading(true);
        try {
            setError(null);
            const data = await withTimeout(api.getJournalEntries());
            const list = Array.isArray(data) ? data.slice().sort(sortByDateDesc) : [];
            let next = list;
            if (!list.length) {
                const created = await withTimeout(api.upsertJournalEntry(getToday(), ''));
                if (created?.entry?.date) {
                    next = [created.entry];
                    if (isMountedRef.current) {
                        setSelectedDate(created.entry.date);
                        setContent(created.entry.content || '');
                        setDirty(false);
                        setSaveState('idle');
                    }
                } else {
                    const fallback = fallbackDate();
                    next = [{ date: fallback, content: '' } as JournalEntry];
                    if (isMountedRef.current) {
                        setSelectedDate(fallback);
                        setContent('');
                        setDirty(false);
                        setSaveState('idle');
                    }
                }
            } else {
                next = await ensureTodayEntry(list);
            }
            if (isMountedRef.current) setEntries(next);
        } catch (err) {
            console.error(err);
            if (isMountedRef.current) {
                const fallback = fallbackDate();
                setEntries([{ date: fallback, content: '' } as JournalEntry]);
                setSelectedDate(fallback);
                setContent('');
                setDirty(false);
                setSaveState('idle');
                setError('Failed to load logs');
            }
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    const saveNow = async (nextContent = contentRef.current, { silent = false, date }: { silent?: boolean; date?: string } = {}) => {
        const targetDate = dateOnly(date || selectedDateRef.current);
        if (!targetDate) return;
        try {
            if (isMountedRef.current && !silent) setSaveState('saving');
            const saved = await withTimeout(api.upsertJournalEntry(targetDate, nextContent));
            if (!isMountedRef.current || silent) return;
            setEntries((prev) => mergeEntry(prev, saved.entry));
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
        isMountedRef.current = true;
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

    const handleSelectDate = async (event: React.ChangeEvent<HTMLSelectElement>) => {
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
            setError(null);
            const created = await withTimeout(api.upsertJournalEntry(normalizedToday, baseContent));
            if (!isMountedRef.current) return;
            setEntries((prev) => mergeEntry(prev, created.entry));
            setSelectedDate(created.entry.date);
            setContent(created.entry.content || '');
            setDirty(false);
            setSaveState('idle');
        } catch (err) {
            console.error(err);
            if (isMountedRef.current) setError('Failed to load logs');
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
            {error ? <div className="muted" style={{ color: '#f38ba8', padding: '8px 16px 0' }}>{error}</div> : null}
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
