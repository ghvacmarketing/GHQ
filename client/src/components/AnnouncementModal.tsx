import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@shared/schema";
import { renderTextWithLinks } from "@/lib/link-parser";

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
          <DialogDescription data-testid="announcement-message" className="whitespace-pre-wrap pt-4 text-base">
            {renderTextWithLinks(announcement.message)}
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
