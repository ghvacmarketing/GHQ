import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@shared/schema";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AnnouncementModalProps {
  announcement: Announcement | null;
  open: boolean;
  onDismiss: () => void;
}

export default function AnnouncementModal({ announcement, open, onDismiss }: AnnouncementModalProps) {
  if (!announcement) return null;

  const handleDismiss = () => {
    // Save dismissal to localStorage with version
    localStorage.setItem(`ghvac-announcement-dismissed-v${announcement.version}`, 'true');
    onDismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="sm:max-w-[500px]" data-testid="announcement-modal">
        <DialogHeader>
          <DialogTitle data-testid="announcement-title">{announcement.title}</DialogTitle>
          <DialogDescription asChild data-testid="announcement-message" className="pt-4">
            <div className="text-base prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline" />
                  ),
                }}
              >
                {announcement.message}
              </ReactMarkdown>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            onClick={handleDismiss} 
            className="w-full sm:w-auto"
            data-testid="button-dismiss-announcement"
          >
            {announcement.buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
