import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Undo, Redo } from 'lucide-react';
import { useEffect, useRef } from 'react';

type RichTextEditorProps = {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  minHeight?: string;
  editable?: boolean;
};

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Type here...',
  minHeight = 'min-h-[200px]',
  editable = true,
}: RichTextEditorProps) {
  // Track the last HTML emitted by this editor so the useEffect below
  // can skip re-syncing when the content prop change originated here
  // (e.g. after typing or pasting), preventing the editor from resetting
  // pasted content mid-keystroke.
  const lastEmittedRef = useRef<string>('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none ${minHeight} p-4`,
      },
      handlePaste: () => false,
    },
  });

  useEffect(() => {
    // Only push external content changes into the editor — skip when
    // the change originated from within this editor (typing / pasting).
    if (editor && content !== lastEmittedRef.current && content !== editor.getHTML()) {
      lastEmittedRef.current = content;
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  const buttonClass = (isActive: boolean) =>
    `h-8 w-8 p-0 ${isActive ? 'bg-muted' : ''}`;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {editable && (
        <div className="border-b p-2 flex flex-wrap gap-1 bg-muted/30">
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} className={buttonClass(editor.isActive('bold'))}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} className={buttonClass(editor.isActive('italic'))}>
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-8 bg-border mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()} className={buttonClass(editor.isActive('bulletList'))}>
            <List className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={buttonClass(editor.isActive('orderedList'))}>
            <ListOrdered className="h-4 w-4" />
          </Button>
          <div className="w-px h-8 bg-border mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo className="h-4 w-4" />
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextDisplay({ content, className }: { content: string; className?: string }) {
  if (!content) return null;
  return (
    <div 
      className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
