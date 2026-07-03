import { useState, useEffect } from "react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import { Button } from "@/components/ui/button";
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type FullScreenFileViewerProps = {
  fileId: string;
  filename: string;
  fileType: string;
  mimeType: string;
  fileData: string; // Base64 encoded
  onClose: () => void;
};

export default function FullScreenFileViewer({
  fileId,
  filename,
  fileType,
  mimeType,
  fileData,
  onClose,
}: FullScreenFileViewerProps) {
  const { toast } = useToast();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [docxHtml, setDocxHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (fileType === 'docx') {
      convertDocxToHtml();
    } else {
      setIsLoading(false);
    }
  }, [fileData, fileType]);

  const convertDocxToHtml = async () => {
    setIsLoading(true);
    setError("");
    try {
      // Convert base64 to array buffer
      const binaryString = atob(fileData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const result = await mammoth.convertToHtml(
        { arrayBuffer: bytes.buffer },
        { includeDefaultStyleMap: true }
      );
      
      setDocxHtml(result.value);
      setIsLoading(false);
    } catch (err) {
      console.error('Error converting DOCX:', err);
      setError('Failed to load document');
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to load document",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    try {
      const blob = base64ToBlob(fileData, mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download started",
        description: filename,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not download file",
        variant: "destructive",
      });
    }
  };

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF');
    setIsLoading(false);
    toast({
      title: "Error",
      description: "Failed to load PDF",
      variant: "destructive",
    });
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading document...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={handleDownload} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
        </div>
      );
    }

    // PDF Viewer
    if (fileType === 'pdf') {
      const pdfData = `data:${mimeType};base64,${fileData}`;
      
      return (
        <div className="h-full overflow-auto bg-muted/30">
          <div className="flex justify-center p-4">
            <Document
              file={pdfData}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              className="max-w-full"
            >
              {Array.from(new Array(numPages), (_, index) => (
                <div key={`page_${index + 1}`} className="mb-4 shadow-lg">
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="mx-auto"
                  />
                </div>
              ))}
            </Document>
          </div>
        </div>
      );
    }

    // DOCX Viewer (converted to HTML)
    if (fileType === 'docx') {
      return (
        <div 
          className="h-full overflow-auto p-8 bg-white dark:bg-gray-900 max-w-4xl mx-auto"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        >
          <div 
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(docxHtml) }}
            data-testid="docx-content"
          />
        </div>
      );
    }

    // Image Viewer
    if (fileType === 'image') {
      const imgSrc = `data:${mimeType};base64,${fileData}`;
      return (
        <div className="h-full overflow-auto flex items-center justify-center p-4 bg-muted/30">
          <img
            src={imgSrc}
            alt={filename}
            className="max-w-full h-auto object-contain"
            style={{ transform: `scale(${scale})` }}
            data-testid="image-content"
          />
        </div>
      );
    }

    // DOC or other unsupported types
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Preview not available for this file type
          </p>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background" data-testid="file-viewer-modal">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-card border-b border-border">
        <div className="flex items-center justify-between p-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate" data-testid="viewer-filename">
              {filename}
            </h2>
            <p className="text-xs text-muted-foreground">
              {fileType.toUpperCase()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom controls for PDF, DOCX, and images */}
            {(fileType === 'pdf' || fileType === 'docx' || fileType === 'image') && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={scale <= 0.5}
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
                  {(scale * 100).toFixed(0)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={scale >= 3}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              data-testid="button-download"
            >
              <Download className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-viewer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="pt-16 h-full">
        {renderContent()}
      </div>
    </div>
  );
}
