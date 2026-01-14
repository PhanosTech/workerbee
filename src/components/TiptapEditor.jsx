import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { NodeSelection } from '@tiptap/pm/state';

const DEFAULT_IMAGE_WIDTH_PX = 720;
const MAX_IMAGE_DIMENSION_PX = 1600;
const IMAGE_QUALITY = 0.85;

const normalizeWidth = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return `${raw}px`;
    if (/^\d+px$/i.test(raw)) return raw.toLowerCase();
    if (/^\d+%$/.test(raw)) return raw;
    return null;
};

const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

const loadImageBitmap = async (file) => {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file);
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new window.Image();
        img.decoding = 'async';
        img.src = url;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
};

const downscaleImageFile = async (file, { maxDimPx, quality }) => {
    const bitmapOrCanvas = await loadImageBitmap(file);
    const sourceWidth = bitmapOrCanvas.width;
    const sourceHeight = bitmapOrCanvas.height;
    const scale = Math.min(1, maxDimPx / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmapOrCanvas, 0, 0, targetWidth, targetHeight);

    const canWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    const type = canWebp ? 'image/webp' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Failed to encode image');
    return { blob, width: targetWidth, height: targetHeight };
};

const ImageWithWidth = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-width') || element.style.width || null,
                renderHTML: (attributes) => {
                    const width = normalizeWidth(attributes.width);
                    if (!width) return {};
                    return {
                        'data-width': width,
                        style: `width:${width};max-width:100%;height:auto;`,
                    };
                },
            },
        };
    },
});

const TiptapEditor = ({
    content,
    onChange,
    onRequestSave,
    placeholder = 'Write notes…',
    editable = true
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: !editable,
                autolink: true,
                linkOnPaste: true,
                validate: href =>
                    /^https?:\/\//i.test(href) ||
                    /^obsidian:\/\//i.test(href) ||
                    /^workbee:\/\//i.test(href) ||
                    /^mailto:/i.test(href),
            }),
            Placeholder.configure({ placeholder }),
            ImageWithWidth.configure({
                allowBase64: true,
            }),
        ],
        content: content || '',
        editable: editable,
        editorProps: {
            handleClick: (view, pos, event) => {
                const target = event?.target;
                if (!(target instanceof HTMLElement)) return false;
                if (target.tagName !== 'IMG') return false;
                const nodePos = view.posAtDOM(target, 0);
                const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos));
                view.dispatch(tr);
                return true;
            },
            handleDOMEvents: {
                dblclick: (view, event) => {
                    const target = event?.target;
                    if (!(target instanceof HTMLElement)) return false;
                    if (target.tagName !== 'IMG') return false;

                    const nodePos = view.posAtDOM(target, 0);
                    const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos));
                    view.dispatch(tr);

                    const existing = target.getAttribute('data-width') || target.style.width || '';
                    const next = window.prompt('Image width (e.g. 720px or 50%, empty = auto)', existing);
                    if (next === null) return true;
                    const width = normalizeWidth(next);
                    view.dispatch(
                        view.state.tr.setNodeMarkup(nodePos, undefined, {
                            ...view.state.doc.nodeAt(nodePos)?.attrs,
                            width,
                        })
                    );
                    return true;
                },
            },
            handlePaste: (view, event) => {
                if (!editable) return false;
                const clipboard = event?.clipboardData;
                if (!clipboard) return false;
                const item = Array.from(clipboard.items || []).find((i) => i.type?.startsWith('image/'));
                if (!item) return false;
                const file = item.getAsFile();
                if (!file) return false;

                event.preventDefault();

                (async () => {
                    try {
                        const { blob, width } = await downscaleImageFile(file, {
                            maxDimPx: MAX_IMAGE_DIMENSION_PX,
                            quality: IMAGE_QUALITY,
                        });
                        const src = await blobToDataUrl(blob);
                        const displayWidth = Math.min(DEFAULT_IMAGE_WIDTH_PX, width);
                        editor
                            ?.chain()
                            .focus()
                            .setImage({ src, width: `${displayWidth}px` })
                            .run();
                    } catch (err) {
                        console.error(err);
                    }
                })();
                return true;
            },
            handleDrop: (view, event) => {
                if (!editable) return false;
                const files = Array.from(event?.dataTransfer?.files || []);
                const file = files.find((f) => f.type?.startsWith('image/'));
                if (!file) return false;
                event.preventDefault();

                (async () => {
                    try {
                        const { blob, width } = await downscaleImageFile(file, {
                            maxDimPx: MAX_IMAGE_DIMENSION_PX,
                            quality: IMAGE_QUALITY,
                        });
                        const src = await blobToDataUrl(blob);
                        const displayWidth = Math.min(DEFAULT_IMAGE_WIDTH_PX, width);
                        editor
                            ?.chain()
                            .focus()
                            .setImage({ src, width: `${displayWidth}px` })
                            .run();
                    } catch (err) {
                        console.error(err);
                    }
                })();
                return true;
            },
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) return;
        const next = content || '';
        if (next === editor.getHTML()) return;
        editor.commands.setContent(next, false);
    }, [editor, content]);

    if (!editor) {
        return null;
    }

    return (
        <div className="tiptap-container">
            {editable && (
                <div className="tiptap-toolbar">
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={editor.isActive('bold') ? 'is-active' : ''}
                        title="Bold"
                    >
                        <strong>B</strong>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={editor.isActive('italic') ? 'is-active' : ''}
                        title="Italic"
                    >
                        <em>I</em>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className={editor.isActive('strike') ? 'is-active' : ''}
                        title="Strikethrough"
                    >
                        <span style={{ textDecoration: 'line-through' }}>S</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={editor.isActive('bulletList') ? 'is-active' : ''}
                        title="Bullet List"
                    >
                        • List
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={editor.isActive('orderedList') ? 'is-active' : ''}
                        title="Numbered List"
                    >
                        1. List
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={editor.isActive('blockquote') ? 'is-active' : ''}
                        title="Quote"
                    >
                        “”
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                        title="Heading"
                    >
                        H
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const previousUrl = editor.getAttributes('link').href;
                            const url = window.prompt('URL', previousUrl || '');
                            if (url) {
                                editor.chain().focus().setLink({ href: url }).run()
                            }
                        }}
                        className={editor.isActive('link') ? 'is-active' : ''}
                        title="Link"
                    >
                        🔗
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().unsetLink().run()}
                        disabled={!editor.isActive('link')}
                        title="Unlink"
                    >
                        ❌🔗
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        title="Undo"
                    >
                        ↩︎
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        title="Redo"
                    >
                        ↪︎
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const current = editor.getAttributes('image')?.width || '';
                            const next = window.prompt('Image width (e.g. 720px or 50%, empty = auto)', String(current));
                            if (next === null) return;
                            const width = normalizeWidth(next);
                            editor.chain().focus().updateAttributes('image', { width }).run();
                        }}
                        disabled={!editor.isActive('image')}
                        title="Resize selected image"
                    >
                        🖼️
                    </button>
                </div>
            )}
            <EditorContent
                editor={editor}
                className="tiptap-content"
                onKeyDown={(e) => {
                    if (!editable || !onRequestSave) return;
                    const isMod = e.metaKey || e.ctrlKey;
                    if (!isMod) return;

                    if (e.key.toLowerCase() === 's' || e.key === 'Enter') {
                        e.preventDefault();
                        onRequestSave();
                    }
                }}
            />
        </div>
    );
};

export default TiptapEditor;
