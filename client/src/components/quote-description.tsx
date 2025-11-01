import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, X, Mic, MicOff, Loader2, Keyboard } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface QuoteDescriptionProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function QuoteDescription({ value, onChange, onClear, disabled = false }: QuoteDescriptionProps) {
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

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
      onChange(data.summary);
      toast({
        title: "Voice Notes Processed",
        description: "Your quote description has been generated from your recording.",
      });
    },
    onError: () => {
      toast({
        title: "Processing Failed",
        description: "Could not process your voice recording. Please try typing instead.",
        variant: "destructive",
      });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          channelCount: 1
        } 
      });
      const mediaRecorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 16000
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
        transcribeAndSummarizeMutation.mutate(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Recording Started",
        description: "Describe the work scope and job details.",
      });
    } catch (error) {
      toast({
        title: "Microphone Access Denied",
        description: "Please allow microphone access or use text input.",
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
        description: "Processing your voice description...",
      });
    }
  };

  return (
    <Card className="slide-in border-2">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="text-primary mr-3 h-5 w-5" />
            <h2 className="text-lg font-semibold text-card-foreground">Quote Description</h2>
          </div>
          {value && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="text-muted-foreground hover:text-destructive"
              data-testid="button-clear-description"
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Input Mode Toggle */}
        <div className="flex gap-2 mb-4 p-1 bg-muted/50 rounded-lg">
          <button
            type="button"
            onClick={() => setInputMode('text')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
              inputMode === 'text' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="button-mode-text"
            disabled={disabled}
          >
            <Keyboard className="h-4 w-4" />
            <span className="font-medium">Type</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('voice')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
              inputMode === 'voice' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="button-mode-voice"
            disabled={disabled}
          >
            <Mic className="h-4 w-4" />
            <span className="font-medium">Voice</span>
          </button>
        </div>

        {/* Text Input Mode */}
        {inputMode === 'text' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Describe the scope of work and job details:
            </p>
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Insert scope of work..."
              rows={6}
              className="resize-none"
              data-testid="textarea-quote-description"
              disabled={disabled}
            />
          </div>
        )}

        {/* Voice Input Mode */}
        {inputMode === 'voice' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Speak naturally to get a summary. e.g. scope of work
            </p>
            
            <div className="flex flex-col space-y-3">
              {!isRecording && !transcribeAndSummarizeMutation.isPending && (
                <Button
                  type="button"
                  onClick={startRecording}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                  data-testid="button-start-recording"
                  disabled={disabled}
                >
                  <Mic className="h-5 w-5" />
                  <span>Start Recording</span>
                </Button>
              )}

              {isRecording && (
                <Button
                  type="button"
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
                  <span className="text-sm text-muted-foreground">Processing your description...</span>
                </div>
              )}
            </div>

            {/* Show generated text below voice controls */}
            {value && !transcribeAndSummarizeMutation.isPending && (
              <div className="mt-4 p-4 bg-muted/20 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground mb-2">Generated Description:</p>
                <div className="text-sm text-card-foreground leading-relaxed whitespace-pre-line">
                  {value}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
