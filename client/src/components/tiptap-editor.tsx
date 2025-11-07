import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Link as LinkIcon,
  Image as ImageIcon,
  FileText,
  Undo,
  Redo,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

type TiptapEditorProps = {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  processId?: string | null;
  onImageUpload?: (file: File) => Promise<string>;
  attachedFiles?: Array<{ id: string; filename: string; fileType: string }>;
};

const MenuBar = ({ 
  editor, 
  onImageUpload, 
  onFileReference, 
  hasFiles 
}: { 
  editor: Editor | null; 
  onImageUpload?: () => void;
  onFileReference?: () => void;
  hasFiles?: boolean;
}) => {
  if (!editor) return null;

  const buttonClass = (isActive: boolean) =>
    `h-8 w-8 p-0 ${isActive ? 'bg-muted' : ''}`;

  return (
    <div className="border-b border-border p-2 flex flex-wrap gap-1 bg-muted/30">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive('bold'))}
        data-testid="button-bold"
      >
        <Bold className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive('italic'))}
        data-testid="button-italic"
      >
        <Italic className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={buttonClass(editor.isActive('heading', { level: 2 }))}
        data-testid="button-heading"
      >
        <Heading2 className="h-4 w-4" />
      </Button>

      <div className="w-px h-8 bg-border mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(editor.isActive('bulletList'))}
        data-testid="button-bullet-list"
      >
        <List className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={buttonClass(editor.isActive('orderedList'))}
        data-testid="button-ordered-list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <div className="w-px h-8 bg-border mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const url = window.prompt('Enter URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        className={buttonClass(editor.isActive('link'))}
        data-testid="button-link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>

      {onImageUpload && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onImageUpload}
          data-testid="button-image"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      )}

      {hasFiles && onFileReference && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onFileReference}
          data-testid="button-file-reference"
        >
          <FileText className="h-4 w-4" />
        </Button>
      )}

      <div className="w-px h-8 bg-border mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        data-testid="button-undo"
      >
        <Undo className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        data-testid="button-redo"
      >
        <Redo className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default function TiptapEditor({
  content,
  onChange,
  placeholder = 'Write something...',
  editable = true,
  processId,
  onImageUpload,
  attachedFiles = [],
}: TiptapEditorProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-4',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] p-4',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Image must be less than 10MB',
          variant: 'destructive',
        });
        return;
      }

      setIsUploading(true);
      try {
        if (onImageUpload) {
          const imageUrl = await onImageUpload(file);
          editor?.chain().focus().setImage({ src: imageUrl }).run();
          toast({
            title: 'Image uploaded',
            description: 'Image added to description',
          });
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        toast({
          title: 'Upload failed',
          description: 'Could not upload image',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
      }
    };

    input.click();
  };

  const handleFileReference = () => {
    if (attachedFiles.length === 0) {
      toast({
        title: 'No files attached',
        description: 'Upload files first to reference them',
      });
      return;
    }

    // For now, insert a simple link - we'll enhance this with a dropdown later
    const file = attachedFiles[0];
    const fileUrl = processId ? `/api/processes/${processId}/attachments/${file.id}` : '#';
    editor?.chain().focus().setLink({ href: fileUrl }).run();
    editor?.commands.insertContent(`📄 ${file.filename}`);
  };

  if (!editor) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background" data-testid="tiptap-editor">
      {editable && (
        <MenuBar
          editor={editor}
          onImageUpload={onImageUpload ? handleImageUpload : undefined}
          onFileReference={attachedFiles.length > 0 ? handleFileReference : undefined}
          hasFiles={attachedFiles.length > 0}
        />
      )}
      <EditorContent editor={editor} />
      {isUploading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Uploading image...</div>
        </div>
      )}
    </div>
  );
}
