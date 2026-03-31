import type { ExternalLink } from '../api';

export const MAX_EXTERNAL_LINKS = 3;

const EXTERNAL_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

const toCandidateUrl = (url: string): string => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return '';
    return EXTERNAL_PROTOCOL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const getExternalLinkLabel = (link: Pick<ExternalLink, 'label' | 'url'>, fallback?: string): string => {
    const label = String(link.label || '').trim();
    if (label) return label;

    const candidate = toCandidateUrl(link.url);
    if (candidate) {
        try {
            const parsed = new URL(candidate);
            const host = parsed.host.replace(/^www\./i, '');
            if (host) return host;
        } catch {
            // Fall through to a readable raw value.
        }
    }

    const compact = String(link.url || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/$/, '');

    if (compact) return compact.length > 24 ? `${compact.slice(0, 21)}...` : compact;
    return fallback || 'Link';
};

export const normalizeExternalLinks = (
    links: Array<Partial<ExternalLink>> | null | undefined,
    legacyUrl?: string | null
): ExternalLink[] => {
    const normalized: ExternalLink[] = [];
    const seen = new Set<string>();

    const pushLink = (candidate: Partial<ExternalLink>) => {
        if (normalized.length >= MAX_EXTERNAL_LINKS) return;
        const url = String(candidate.url || '').trim();
        if (!url) return;
        const label = getExternalLinkLabel({ label: String(candidate.label || ''), url }, `Link ${normalized.length + 1}`);
        const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({ label, url });
    };

    (Array.isArray(links) ? links : []).forEach((link) => pushLink(link));

    if ((!Array.isArray(links) || links.length === 0) && legacyUrl) {
        pushLink({ url: legacyUrl });
    }

    return normalized;
};

export const getPrimaryExternalUrl = (links: Array<Partial<ExternalLink>> | null | undefined): string | null => {
    const normalized = normalizeExternalLinks(links);
    return normalized[0]?.url || null;
};

export const openExternalUrl = (url: string | null | undefined) => {
    const candidate = toCandidateUrl(String(url || '').trim());
    if (!candidate) return;
    window.electronAPI?.openExternal(candidate);
};
