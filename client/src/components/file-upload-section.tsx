import { useState, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, GripVertical, FileText, Image as ImageIcon, FileType } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type PendingFile = {
  id: string;
  file: File;
  displayOrder: number;
};

type FileUploadSectionProps = {
  files: PendingFile[];
  onFilesChange: (files: PendingFile[]) => void;
  maxTotalSizeMB?: number;
  disabled?: boolean;
};

const ALLOWED_FILE_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/msword': 'DOC',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
};

const MAX_FILE_SIZE_MB = 10;

export default function FileUploadSection({
  files,
  onFilesChange,
  maxTotalSizeMB = 50,
  disabled = false,
}: FileUploadSectionProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const getTotalSizeMB = () => {
    const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
    return (totalBytes / (1024 * 1024)).toFixed(2);
  };

  const validateFile = (file: File): string | null => {
    // Check file type
    if (!Object.keys(ALLOWED_FILE_TYPES).includes(file.type)) {
      return `File type not supported. Allowed: PDF, DOCX, DOC, PNG, JPG`;
    }

    // Check individual file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`;
    }

    // Check total size after adding this file
    const currentTotalMB = parseFloat(getTotalSizeMB());
    if (currentTotalMB + fileSizeMB > maxTotalSizeMB) {
      return `Total size would exceed ${maxTotalSizeMB}MB limit`;
    }

    return null;
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    const validFiles: PendingFile[] = [];
    const errors: string[] = [];

    selectedFiles.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push({
          id: `${Date.now()}-${Math.random()}`,
          file,
          displayOrder: files.length + validFiles.length,
        });
      }
    });

    if (errors.length > 0) {
      toast({
        title: "Some files could not be added",
        description: errors.join('; '),
        variant: "destructive",
      });
    }

    if (validFiles.length > 0) {
      onFilesChange([...files, ...validFiles]);
      toast({
        title: "Files added",
        description: `${validFiles.length} file(s) ready to upload`,
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    const updatedFiles = files
      .filter((f) => f.id !== id)
      .map((f, index) => ({ ...f, displayOrder: index }));
    onFilesChange(updatedFiles);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newFiles = [...files];
    const draggedFile = newFiles[draggedIndex];
    newFiles.splice(draggedIndex, 1);
    newFiles.splice(index, 0, draggedFile);

    // Update display orders
    const reorderedFiles = newFiles.map((f, i) => ({ ...f, displayOrder: i }));
    onFilesChange(reorderedFiles);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5 text-blue-500" />;
    } else if (mimeType === 'application/pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    } else {
      return <FileType className="h-5 w-5 text-purple-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Attachments (optional)
        </label>
        <span className="text-xs text-muted-foreground">
          {getTotalSizeMB()} MB / {maxTotalSizeMB} MB
        </span>
      </div>

      {files.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-1">
            No files attached
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            PDF, DOCX, DOC, PNG, JPG (Max {MAX_FILE_SIZE_MB}MB each)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            data-testid="button-upload-files"
          >
            <Upload className="h-4 w-4 mr-2" />
            Choose Files
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((pendingFile, index) => (
            <div
              key={pendingFile.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 p-3 bg-muted rounded-lg ${
                draggedIndex === index ? 'opacity-50' : ''
              }`}
              data-testid={`file-item-${pendingFile.id}`}
            >
              <div className="cursor-grab active:cursor-grabbing" data-testid={`drag-handle-${pendingFile.id}`}>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              
              {getFileIcon(pendingFile.file.type)}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid={`file-name-${pendingFile.id}`}>
                  {pendingFile.file.name}
                </p>
                <p className="text-xs text-muted-foreground" data-testid={`file-size-${pendingFile.id}`}>
                  {formatFileSize(pendingFile.file.size)}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => removeFile(pendingFile.id)}
                disabled={disabled}
                data-testid={`button-remove-file-${pendingFile.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            data-testid="button-add-more-files"
          >
            <Upload className="h-4 w-4 mr-2" />
            Add More Files
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />
    </div>
  );
}
