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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
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
        throw new Error('Failed to process voice recording');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      onSummaryGenerated(data.summary);
      setAudioBlob(null);
      toast({
        title: "Voice Notes Processed",
        description: "Your voice notes have been converted to bullet points.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process voice recording. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
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

  const processRecording = () => {
    if (audioBlob) {
      transcribeAndSummarizeMutation.mutate(audioBlob);
    }
  };

  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <FileText className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Voice Notes</h2>
        </div>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Record voice notes about the job and I'll convert them to bullet points for your quote.
          </p>
          
          <div className="flex flex-col space-y-3">
            {!isRecording && !audioBlob && (
              <Button
                onClick={startRecording}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                data-testid="button-start-recording"
              >
                <Mic className="h-5 w-5" />
                <span>Start Recording</span>
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopRecording}
                className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2 animate-pulse"
                data-testid="button-stop-recording"
              >
                <MicOff className="h-5 w-5" />
                <span>Stop Recording</span>
              </Button>
            )}

            {audioBlob && !transcribeAndSummarizeMutation.isPending && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Recording ready to process</p>
                <div className="flex space-x-2">
                  <Button
                    onClick={processRecording}
                    className="flex-1 bg-chart-1 hover:bg-chart-1/90 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    data-testid="button-process-recording"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Generate Summary</span>
                  </Button>
                  <Button
                    onClick={() => setAudioBlob(null)}
                    variant="outline"
                    className="px-4"
                    data-testid="button-discard-recording"
                  >
                    Discard
                  </Button>
                </div>
              </div>
            )}

            {transcribeAndSummarizeMutation.isPending && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Processing voice notes...</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}