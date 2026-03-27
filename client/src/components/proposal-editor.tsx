import { useEditor, EditorContent, NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Undo, Redo, ImageIcon, Link as LinkIcon, AlignLeft, AlignCenter,
  AlignRight, Heading1, Heading2, Heading3, Type, Minus, Loader2,
  FolderOpen,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function ResizableImageView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const [resizing, setResizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const width = node.attrs.width || null;
  const align = node.attrs.align || 'center';

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = imgRef.current?.offsetWidth || 300;

    const onMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startXRef.current;
      const newWidth = Math.max(100, startWidthRef.current + diff);
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateAttributes]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    if (!editor || typeof getPos !== 'function') return;

    const editorEl = editor.view.dom;
    const startY = e.clientY;
    let indicator: HTMLDivElement | null = null;
    let dropPos: number | null = null;
    const DRAG_THRESHOLD = 6;
    let activated = false;

    let prevPosition = '';
    const createIndicator = () => {
      indicator = document.createElement('div');
      indicator.className = 'proposal-drag-indicator';
      indicator.style.cssText = 'position:absolute;left:12px;right:12px;height:4px;background:#711419;border-radius:4px;z-index:50;pointer-events:none;transition:top 0.1s ease;box-shadow:0 0 0 3px rgba(113,20,25,0.15);';
      const arrowLeft = document.createElement('div');
      arrowLeft.style.cssText = 'position:absolute;left:-6px;top:-4px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:6px solid #711419;';
      const arrowRight = document.createElement('div');
      arrowRight.style.cssText = 'position:absolute;right:-6px;top:-4px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:6px solid #711419;';
      indicator.appendChild(arrowLeft);
      indicator.appendChild(arrowRight);
      prevPosition = editorEl.style.position;
      editorEl.style.position = 'relative';
      editorEl.appendChild(indicator);
    };

    const findDropPosition = (clientY: number): { pos: number; topPx: number } | null => {
      const editorRect = editorEl.getBoundingClientRect();
      const centerX = editorRect.left + editorRect.width / 2;
      const posInfo = editor.view.posAtCoords({ left: centerX, top: clientY });
      const myPos = getPos();
      const myEnd = myPos + node.nodeSize;

      if (posInfo) {
        const resolvedPos = editor.state.doc.resolve(posInfo.pos);
        let blockPos: number;
        if (resolvedPos.depth === 0) {
          blockPos = posInfo.pos;
        } else {
          const parentOffset = resolvedPos.before(1);
          const parentNode = editor.state.doc.nodeAt(parentOffset);
          if (!parentNode) {
            blockPos = posInfo.pos;
          } else {
            const parentDom = editor.view.nodeDOM(parentOffset) as HTMLElement | null;
            if (parentDom && parentDom instanceof HTMLElement) {
              const parentRect = parentDom.getBoundingClientRect();
              const midY = parentRect.top + parentRect.height / 2;
              blockPos = clientY < midY ? parentOffset : parentOffset + parentNode.nodeSize;
            } else {
              blockPos = parentOffset;
            }
          }
        }

        if (blockPos >= myPos && blockPos <= myEnd) return null;

        let indicatorY: number;
        const domAtPos = editor.view.domAtPos(blockPos);
        if (domAtPos && domAtPos.node instanceof HTMLElement) {
          const targetEl = domAtPos.node.nodeType === 1 ? domAtPos.node : domAtPos.node.parentElement;
          if (targetEl) {
            const targetRect = (targetEl as HTMLElement).getBoundingClientRect();
            indicatorY = targetRect.top - editorRect.top + editorEl.scrollTop;
          } else {
            indicatorY = clientY - editorRect.top + editorEl.scrollTop;
          }
        } else {
          indicatorY = clientY - editorRect.top + editorEl.scrollTop;
        }

        indicatorY = Math.max(0, Math.min(indicatorY, editorEl.scrollHeight));
        return { pos: blockPos, topPx: indicatorY };
      }

      let bestGap: { pos: number; topPx: number; dist: number } | null = null;
      editor.state.doc.forEach((child, offset) => {
        if (offset >= myPos && offset < myEnd) return;
        const domNode = editor.view.nodeDOM(offset) as HTMLElement | null;
        if (!domNode || !(domNode instanceof HTMLElement)) return;
        const rect = domNode.getBoundingClientRect();

        const distTop = Math.abs(clientY - rect.top);
        if (!bestGap || distTop < bestGap.dist) {
          bestGap = { pos: offset, topPx: rect.top - editorRect.top + editorEl.scrollTop, dist: distTop };
        }
        const distBottom = Math.abs(clientY - rect.bottom);
        if (!bestGap || distBottom < bestGap.dist) {
          bestGap = { pos: offset + child.nodeSize, topPx: rect.bottom - editorRect.top + editorEl.scrollTop, dist: distBottom };
        }
      });
      return bestGap;
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!activated && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
      if (!activated) {
        activated = true;
        setDragging(true);
        createIndicator();
        document.body.style.cursor = 'grabbing';
      }
      const result = findDropPosition(ev.clientY);
      if (result && indicator) {
        dropPos = result.pos;
        indicator.style.top = `${result.topPx - 2}px`;
        indicator.style.display = 'block';
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      setDragging(false);

      if (indicator) {
        indicator.remove();
        editorEl.style.position = prevPosition;
      }

      if (!activated || dropPos === null || !editor || typeof getPos !== 'function') return;

      const currentPos = getPos();
      const nodeSize = node.nodeSize;
      const { tr } = editor.state;

      if (dropPos === currentPos || dropPos === currentPos + nodeSize) return;

      const nodeSlice = editor.state.doc.slice(currentPos, currentPos + nodeSize);
      tr.delete(currentPos, currentPos + nodeSize);
      const adjustedPos = dropPos > currentPos ? dropPos - nodeSize : dropPos;
      tr.insert(adjustedPos, nodeSlice.content);
      editor.view.dispatch(tr);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [editor, getPos, node]);

  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  return (
    <NodeViewWrapper className={`flex ${justifyClass} my-3`}>
      <div
        ref={imgRef}
        className={`relative inline-block group ${selected ? 'ring-2 ring-[#711419] ring-offset-2 rounded' : ''} ${dragging ? 'opacity-40' : ''}`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%', cursor: dragging ? 'grabbing' : 'default' }}
        onMouseDown={handleDragStart}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          className="block w-full h-auto rounded"
          draggable={false}
        />
        <div
          className="resize-handle absolute top-0 right-0 w-3 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={handleResizeStart}
          style={{ background: 'linear-gradient(to left, rgba(113,20,25,0.3), transparent)' }}
        />
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity bg-[#711419] rounded-tl"
          onMouseDown={handleResizeStart}
        />
      </div>
    </NodeViewWrapper>
  );
}

const alignStyles: Record<string, string> = {
  left: 'display: block; margin-left: 0; margin-right: auto;',
  center: 'display: block; margin-left: auto; margin-right: auto;',
  right: 'display: block; margin-left: auto; margin-right: 0;',
};

const ResizableImage = Image.extend({
  draggable: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const dw = el.getAttribute('data-width');
          if (dw) return parseInt(dw);
          const sw = el.style?.width;
          if (sw && sw.endsWith('px')) return parseInt(sw);
          return null;
        },
        renderHTML: (attrs) => attrs.width ? { 'data-width': attrs.width } : {},
      },
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align || 'center' }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const w = HTMLAttributes['data-width'];
    const a = HTMLAttributes['data-align'] || 'center';
    const widthStyle = w ? `width: ${w}px; max-width: 100%;` : 'max-width: 100%;';
    const style = `${widthStyle} ${alignStyles[a] || alignStyles.center}`;
    return ['img', { ...HTMLAttributes, style, class: 'proposal-image' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView, { draggable: false });
  },
});

type LibraryImage = { id: string; name: string; url: string };

type ProposalEditorProps = {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  imageLibrary?: LibraryImage[];
};

export default function ProposalEditor({
  value,
  onChange,
  placeholder = 'Start building your proposal template...',
  imageLibrary,
}: ProposalEditorProps) {
  const { toast } = useToast();
  const lastEmittedRef = useRef<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        dropcursor: {
          color: '#711419',
          width: 4,
        },
      }),
      Placeholder.configure({ placeholder }),
      ResizableImage.configure({
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] p-6',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0 && files[0]?.type?.startsWith('image/')) {
          event.preventDefault();
          handleImageUpload(files[0]);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && value !== lastEmittedRef.current && value !== editor.getHTML()) {
      lastEmittedRef.current = value;
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Only image files are supported", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await res.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const imageUrl = objectPath;
      editor.chain().focus('end').setImage({ src: imageUrl }).run();
      toast({ title: "Image added" });
    } catch (err) {
      console.error("Image upload failed:", err);
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [editor, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleImageUpload]);

  const addLink = useCallback(() => {
    if (!editor) return;
    if (linkUrl) {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setLinkUrl('');
    setLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  const ToolbarButton = ({ onClick, active, disabled, title, children }: {
    onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 w-8 p-0 ${active ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
    >
      {children}
    </Button>
  );

  const Divider = () => <div className="w-px h-6 bg-slate-200 mx-0.5" />;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="border-b px-2 py-1.5 flex flex-wrap items-center gap-0.5 bg-slate-50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive('paragraph') && !editor.isActive('heading')}
          title="Normal text"
        >
          <Type className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => {
            if (editor.isActive('image')) {
              editor.chain().focus().updateAttributes('image', { align: 'left' }).run();
            } else {
              editor.chain().focus().setTextAlign('left').run();
            }
          }}
          active={editor.isActive({ textAlign: 'left' }) || (editor.isActive('image') && editor.getAttributes('image').align === 'left')}
          title="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (editor.isActive('image')) {
              editor.chain().focus().updateAttributes('image', { align: 'center' }).run();
            } else {
              editor.chain().focus().setTextAlign('center').run();
            }
          }}
          active={editor.isActive({ textAlign: 'center' }) || (editor.isActive('image') && (editor.getAttributes('image').align === 'center' || !editor.getAttributes('image').align))}
          title="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (editor.isActive('image')) {
              editor.chain().focus().updateAttributes('image', { align: 'right' }).run();
            } else {
              editor.chain().focus().setTextAlign('right').run();
            }
          }}
          active={editor.isActive({ textAlign: 'right' }) || (editor.isActive('image') && editor.getAttributes('image').align === 'right')}
          title="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Insert link"
              className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-slate-200 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => {
                const existing = editor.getAttributes('link').href;
                setLinkUrl(existing || '');
              }}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="text-sm h-8"
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={addLink}>
                  {editor.isActive('link') ? 'Update' : 'Add'} Link
                </Button>
                {editor.isActive('link') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      editor.chain().focus().unsetLink().run();
                      setLinkPopoverOpen(false);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload image"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        </ToolbarButton>

        {imageLibrary && imageLibrary.length > 0 && (
          <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Insert from image library"
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <p className="text-xs font-medium text-slate-500 px-1 mb-2">Image Library</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {imageLibrary.map((img) => (
                  <button
                    key={img.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-slate-100 text-left"
                    onClick={() => {
                      editor.chain().focus('end').setImage({ src: img.url }).run();
                      setLibraryOpen(false);
                    }}
                  >
                    <img src={img.url} alt={img.name} className="w-8 h-8 rounded object-cover flex-shrink-0 border" />
                    <span className="text-xs text-slate-700 truncate">{img.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {uploading && (
        <div className="bg-blue-50 border-b px-3 py-1.5 flex items-center gap-2 text-xs text-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Uploading image...
        </div>
      )}

      <div className="proposal-editor-content">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .proposal-editor-content .ProseMirror {
          outline: none;
        }
        .proposal-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          color: #adb5bd;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .proposal-editor-content .ProseMirror hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 16px 0;
        }
      `}</style>
    </div>
  );
}
