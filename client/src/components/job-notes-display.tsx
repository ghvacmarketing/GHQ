import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, X, Edit3 } from "lucide-react";
import { useState } from "react";

interface JobNotesDisplayProps {
  jobNotes: string;
  onClear: () => void;
  onUpdate: (updatedNotes: string) => void;
  disabled?: boolean;
}

export default function JobNotesDisplay({ jobNotes, onClear, onUpdate, disabled = false }: JobNotesDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState(jobNotes);

  if (!jobNotes) return null;

  const handleStartEdit = () => {
    setEditedNotes(jobNotes);
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdate(editedNotes);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedNotes(jobNotes);
    setIsEditing(false);
  };

  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="text-primary mr-3 h-5 w-5" />
            <h2 className="text-lg font-semibold text-card-foreground">Job Notes</h2>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartEdit}
                className="text-muted-foreground hover:text-primary"
                data-testid="button-edit-notes"
                disabled={disabled}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="text-muted-foreground hover:text-destructive"
              data-testid="button-clear-notes"
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {!isEditing ? (
          <div className="bg-muted/20 rounded-lg p-4">
            <div 
              className="text-sm text-card-foreground leading-relaxed whitespace-pre-line"
              data-testid="text-job-notes"
            >
              {jobNotes}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Edit your job notes:
            </p>
            <textarea
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              className="w-full h-32 p-3 text-sm bg-muted/20 rounded-lg border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="• Job finding 1&#10;• Issue discovered&#10;• Recommendation"
              data-testid="textarea-edit-job-notes"
            />
            <div className="flex space-x-2">
              <Button
                onClick={handleSave}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors"
                data-testid="button-save-edited-notes"
              >
                Save Changes
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="px-4"
                data-testid="button-cancel-edit-notes"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}