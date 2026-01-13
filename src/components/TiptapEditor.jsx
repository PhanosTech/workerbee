import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

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
                    /^https?:\/\//i.test(href) || /^obsidian:\/\//i.test(href) || /^mailto:/i.test(href),
            }),
            Placeholder.configure({ placeholder }),
        ],
        content: content || '',
        editable: editable,
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
