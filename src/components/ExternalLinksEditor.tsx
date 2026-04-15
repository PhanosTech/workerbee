import React, { useEffect, useRef, useState } from 'react';
import type { ExternalLink } from '../api';
import { MAX_EXTERNAL_LINKS, getExternalLinkLabel, openExternalUrl } from '../utils/linkUtils';

interface ExternalLinksEditorProps {
    links?: ExternalLink[];
    onChange: (links: ExternalLink[]) => void;
}

interface ExternalLinkDraft extends ExternalLink {
    rowId: number;
}

const toLinkList = (links?: ExternalLink[]): ExternalLink[] =>
    (Array.isArray(links) ? links : [])
        .slice(0, MAX_EXTERNAL_LINKS)
        .map((link) => ({
            label: String(link?.label || ''),
            url: String(link?.url || ''),
        }));

const getLinksSignature = (links?: ExternalLink[]): string =>
    JSON.stringify(toLinkList(links));

const ExternalLinksEditor: React.FC<ExternalLinksEditorProps> = ({ links = [], onChange }) => {
    const nextRowIdRef = useRef(1);
    const lastSyncedSignatureRef = useRef(getLinksSignature(links));

    const buildDrafts = (nextLinks: ExternalLink[], previousDrafts: ExternalLinkDraft[] = []): ExternalLinkDraft[] =>
        nextLinks.map((link, index) => ({
            rowId: previousDrafts[index]?.rowId ?? nextRowIdRef.current++,
            label: String(link.label || ''),
            url: String(link.url || ''),
        }));

    const [drafts, setDrafts] = useState<ExternalLinkDraft[]>(() => buildDrafts(toLinkList(links)));

    useEffect(() => {
        const nextSignature = getLinksSignature(links);
        if (nextSignature === lastSyncedSignatureRef.current) return;
        setDrafts((previousDrafts) => buildDrafts(toLinkList(links), previousDrafts));
        lastSyncedSignatureRef.current = nextSignature;
    }, [links]);

    const syncDrafts = (nextDrafts: ExternalLinkDraft[]) => {
        const nextLinks = nextDrafts.map(({ label, url }) => ({ label, url }));
        lastSyncedSignatureRef.current = getLinksSignature(nextLinks);
        setDrafts(nextDrafts);
        onChange(nextLinks);
    };

    const handleChange = (index: number, field: keyof ExternalLink, value: string) => {
        const next = drafts.slice();
        next[index] = {
            rowId: next[index]?.rowId ?? nextRowIdRef.current++,
            label: field === 'label' ? value : String(next[index]?.label || ''),
            url: field === 'url' ? value : String(next[index]?.url || ''),
        };
        syncDrafts(next);
    };

    const handleAdd = () => {
        if (drafts.length >= MAX_EXTERNAL_LINKS) return;
        syncDrafts([
            ...drafts,
            { rowId: nextRowIdRef.current++, label: '', url: '' },
        ]);
    };

    const handleRemove = (index: number) => {
        syncDrafts(drafts.filter((_, draftIndex) => draftIndex !== index));
    };

    return (
        <div className="external-links-editor">
            {drafts.length > 0 ? (
                <div className="external-links-list">
                    {drafts.map((link, index) => (
                        <div key={link.rowId} className="external-link-row">
                            <div className="external-link-grid">
                                <input
                                    type="text"
                                    value={link.label || ''}
                                    onChange={(e) => handleChange(index, 'label', e.target.value)}
                                    placeholder={`Label ${index + 1}`}
                                />
                                <input
                                    type="text"
                                    value={link.url || ''}
                                    onChange={(e) => handleChange(index, 'url', e.target.value)}
                                    placeholder="https://example.com"
                                />
                            </div>
                            <div className="external-link-actions">
                                <button
                                    type="button"
                                    className="link-btn"
                                    disabled={!String(link.url || '').trim()}
                                    onClick={() => openExternalUrl(link.url)}
                                    title={`Open ${getExternalLinkLabel(link, `Link ${index + 1}`)}`}
                                >
                                    Open
                                </button>
                                <button
                                    type="button"
                                    className="link-btn danger-link"
                                    onClick={() => handleRemove(index)}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                    No links added yet.
                </div>
            )}

            <div className="external-links-footer">
                <button type="button" onClick={handleAdd} disabled={drafts.length >= MAX_EXTERNAL_LINKS}>
                    + Add Link
                </button>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                    Up to {MAX_EXTERNAL_LINKS}. Short labels work best for quick tags.
                </div>
            </div>
        </div>
    );
};

export default ExternalLinksEditor;
