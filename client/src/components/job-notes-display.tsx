import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, X } from "lucide-react";

interface JobNotesDisplayProps {
  jobNotes: string;
  onClear: () => void;
}

export default function JobNotesDisplay({ jobNotes, onClear }: JobNotesDisplayProps) {
  if (!jobNotes) return null;

  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="text-primary mr-3 h-5 w-5" />
            <h2 className="text-lg font-semibold text-card-foreground">Job Notes</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="text-muted-foreground hover:text-destructive"
            data-testid="button-clear-notes"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="bg-muted/20 rounded-lg p-4">
          <div 
            className="text-sm text-card-foreground leading-relaxed whitespace-pre-line"
            data-testid="text-job-notes"
          >
            {jobNotes}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}