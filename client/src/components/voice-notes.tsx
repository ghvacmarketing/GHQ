import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VoiceNotesProps {
  onSummaryGenerated: (summary: string) => void;
}

export default function VoiceNotes({ onSummaryGenerated }: VoiceNotesProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const transcribeAndSummarizeMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      
      const response = await fetch('/api/voice/summarize', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        // If API fails, use browser speech recognition as fallback
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          throw new Error('API_FALLBACK');
        }
        throw new Error('Failed to process voice recording');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Check if no meaningful audio was detected
      if (data.summary === "NO_AUDIO_DETECTED") {
        setTranscribedText("• ");
        setIsEditing(true);
        toast({
          title: "No Audio Detected",
          description: "Please speak clearly or type your job notes manually.",
          variant: "destructive",
        });
      } else {
        setTranscribedText(data.summary);
        setIsEditing(true);
        toast({
          title: "Voice Notes Ready",
          description: "Review and edit your notes below.",
        });
      }
    },
    onError: (error) => {
      if (error.message === 'API_FALLBACK') {
        // Fallback to manual text input
        setTranscribedText("• [Voice recording completed - please type your job notes here]\n• \n• ");
        setIsEditing(true);
        toast({
          title: "Voice Recorded",
          description: "Please type your job notes in the text area below.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to process voice recording. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, // Lower sample rate for faster upload
          channelCount: 1 // Mono audio
        } 
      });
      const mediaRecorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 16000 // Low bitrate for speed
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        // Automatically process the recording
        transcribeAndSummarizeMutation.mutate(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Recording Started",
        description: "Speak about the job details and findings.",
      });
    } catch (error) {
      toast({
        title: "Microphone Access Denied",
        description: "Please allow microphone access to use voice notes.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      toast({
        title: "Recording Stopped",
        description: "Processing your voice notes...",
      });
    }
  };

  const saveNotes = () => {
    onSummaryGenerated(transcribedText);
    setTranscribedText("");
    setIsEditing(false);
    toast({
      title: "Notes Saved",
      description: "Your job notes have been added to the quote.",
    });
  };

  const cancelEditing = () => {
    setTranscribedText("");
    setIsEditing(false);
  };

  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <FileText className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Voice Notes</h2>
        </div>
        
        <div className="space-y-4">
          {!isEditing && (
            <>
              <p className="text-sm text-muted-foreground">
                Record voice notes about the job findings and I'll help organize them.
              </p>
              
              <div className="flex flex-col space-y-3">
                {!isRecording && !transcribeAndSummarizeMutation.isPending && (
                  <Button
                    onClick={startRecording}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    data-testid="button-start-recording"
                  >
                    <Mic className="h-5 w-5" />
                    <span>Record Job Notes</span>
                  </Button>
                )}

                {isRecording && (
                  <Button
                    onClick={stopRecording}
                    className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2 animate-pulse"
                    data-testid="button-stop-recording"
                  >
                    <MicOff className="h-5 w-5" />
                    <span>Stop & Process</span>
                  </Button>
                )}

                {transcribeAndSummarizeMutation.isPending && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Processing your notes...</span>
                  </div>
                )}
              </div>
            </>
          )}

          {isEditing && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Review and edit your job notes:
              </p>
              <textarea
                value={transcribedText}
                onChange={(e) => setTranscribedText(e.target.value)}
                className="w-full h-32 p-3 text-sm bg-muted/20 rounded-lg border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="• Job finding 1&#10;• Issue discovered&#10;• Recommendation"
                data-testid="textarea-job-notes"
              />
              <div className="flex space-x-2">
                <Button
                  onClick={saveNotes}
                  className="flex-1 bg-chart-1 hover:bg-chart-1/90 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  data-testid="button-save-notes"
                >
                  Save Notes
                </Button>
                <Button
                  onClick={cancelEditing}
                  variant="outline"
                  className="px-4"
                  data-testid="button-cancel-notes"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}