import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertProcessSchema, type ProcessStep } from "@shared/schema";
import { nanoid } from "nanoid";
import { Card, CardContent } from "@/components/ui/card";

const formSchema = insertProcessSchema;
type FormData = z.infer<typeof formSchema>;

interface VoiceProcessBuilderProps {
  onSuccess: () => void;
}

const prompts = [
  { field: "name", prompt: "What is the name of this process?" },
  { field: "description", prompt: "Please provide a brief description of this process." },
  { field: "category", prompt: "What category does this process belong to?" },
  { field: "rationale", prompt: "Why is this process necessary? Provide details and relevant information." },
  { field: "steps", prompt: "Now, please describe each step one by one. Say 'next step' between each instruction. Say 'finished' when done." },
];

export default function VoiceProcessBuilder({ onSuccess }: VoiceProcessBuilderProps) {
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processData, setProcessData] = useState<Partial<FormData>>({
    steps: [],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      rationale: "",
      steps: [],
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      
      const response = await fetch('/api/voice/summarize', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Transcription failed');
      return response.json();
    },
    onSuccess: (data) => {
      handleTranscriptionResult(data.summary);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create process');
      return response.json();
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleTranscriptionResult = (text: string) => {
    const currentPrompt = prompts[currentPromptIndex];
    
    if (currentPrompt.field === "steps") {
      // Parse steps - split by common delimiters
      const stepTexts = text
        .split(/next step|step \d+|then|after that/i)
        .map(s => s.trim())
        .filter(s => s && !s.toLowerCase().includes('finished'));
      
      const newSteps: ProcessStep[] = stepTexts.map((instruction, idx) => ({
        id: nanoid(),
        stepNumber: (processData.steps?.length || 0) + idx + 1,
        instruction,
      }));
      
      setProcessData(prev => ({
        ...prev,
        steps: [...(prev.steps || []), ...newSteps],
      }));
      
      if (text.toLowerCase().includes('finished')) {
        // All done, create the process
        const finalData: FormData = {
          name: processData.name || "",
          description: processData.description || "",
          category: processData.category || "",
          rationale: processData.rationale || "",
          steps: [...(processData.steps || []), ...newSteps],
        };
        createMutation.mutate(finalData);
      }
    } else {
      setProcessData(prev => ({
        ...prev,
        [currentPrompt.field]: text,
      }));
      
      if (currentPromptIndex < prompts.length - 1) {
        setCurrentPromptIndex(currentPromptIndex + 1);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        transcribeMutation.mutate(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const currentPrompt = prompts[currentPromptIndex];

  return (
    <Form {...form}>
      <div className="space-y-6">
        <div className="bg-muted/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Voice-Guided Process Creation</h3>
          
          {/* Prompt List */}
          <div className="space-y-2 mb-6">
            <p className="text-sm text-muted-foreground mb-3">Follow these prompts in order:</p>
            {prompts.map((p, idx) => (
              <div 
                key={idx} 
                className={`flex items-start gap-2 text-sm p-2 rounded ${
                  idx === currentPromptIndex ? 'bg-primary/10 text-primary font-medium' : 
                  idx < currentPromptIndex ? 'text-muted-foreground line-through' : 
                  'text-muted-foreground'
                }`}
                data-testid={`prompt-item-${idx}`}
              >
                <span className="min-w-[20px]">{idx + 1}.</span>
                <span>{p.prompt}</span>
              </div>
            ))}
          </div>

          {/* Current Prompt Display */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Current Prompt:</p>
              <p className="font-medium" data-testid="text-current-prompt">{currentPrompt.prompt}</p>
            </CardContent>
          </Card>

          {/* Recording Controls */}
          <div className="flex flex-col items-center gap-4">
            <Button
              type="button"
              size="lg"
              variant={isRecording ? "destructive" : "default"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={transcribeMutation.isPending || createMutation.isPending}
              className="w-full h-16"
              data-testid="button-record-toggle"
            >
              {transcribeMutation.isPending || createMutation.isPending ? (
                <>
                  <Loader2 className="h-6 w-6 mr-2 animate-spin" />
                  Processing...
                </>
              ) : isRecording ? (
                <>
                  <MicOff className="h-6 w-6 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="h-6 w-6 mr-2" />
                  Start Recording
                </>
              )}
            </Button>

            {isRecording && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                Recording...
              </div>
            )}
          </div>

          {/* Progress Display */}
          {Object.keys(processData).filter(k => processData[k as keyof typeof processData]).length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium">Captured Data:</p>
              <div className="text-xs space-y-1">
                {processData.name && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-medium">Name:</span> {processData.name}
                  </div>
                )}
                {processData.description && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-medium">Description:</span> {processData.description}
                  </div>
                )}
                {processData.category && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-medium">Category:</span> {processData.category}
                  </div>
                )}
                {processData.rationale && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-medium">Rationale:</span> {processData.rationale}
                  </div>
                )}
                {processData.steps && processData.steps.length > 0 && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-medium">Steps:</span> {processData.steps.length} captured
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Form>
  );
}
