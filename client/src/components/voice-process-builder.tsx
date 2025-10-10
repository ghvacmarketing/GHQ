import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Mic, MicOff, Loader2, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep } from "@shared/schema";
import { nanoid } from "nanoid";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertProcessSchema;
type FormData = z.infer<typeof formSchema>;

interface VoiceProcessBuilderProps {
  onSuccess: () => void;
}

const prompts = [
  { field: "name", prompt: "What is the name of this process?", context: "the process name (a short title)" },
  { field: "description", prompt: "Please provide a brief description of this process.", context: "a brief description of the process" },
  { field: "category", prompt: "What category does this process belong to?", context: "the category name (e.g., Maintenance, Repair, Installation)" },
  { field: "rationale", prompt: "Why is this process necessary? Provide details and relevant information.", context: "the rationale explaining why this process is necessary" },
  { field: "steps", prompt: "Now, please describe each step one by one. Say 'next step' between each instruction. Say 'finished' when done.", context: "step-by-step instructions" },
];

export default function VoiceProcessBuilder({ onSuccess }: VoiceProcessBuilderProps) {
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processData, setProcessData] = useState<Partial<FormData>>({
    name: "",
    description: "",
    category: "",
    rationale: "",
    steps: [],
  });
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: processData,
  });

  const transcribeMutation = useMutation({
    mutationFn: async ({ audioBlob, context }: { audioBlob: Blob; context: string }) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('context', context);
      
      const response = await fetch('/api/voice/transcribe-with-context', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Transcription failed');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.summary === "NO_AUDIO_DETECTED") {
        toast({
          title: "No audio detected",
          description: "Please try recording again.",
          variant: "destructive",
        });
        return; // Stay on the same step
      }
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
      
      const updatedSteps = [...(processData.steps || []), ...newSteps];
      setProcessData(prev => ({
        ...prev,
        steps: updatedSteps,
      }));
      
      if (text.toLowerCase().includes('finished')) {
        // Move to next step (which triggers save)
        if (currentPromptIndex < prompts.length - 1) {
          setCurrentPromptIndex(currentPromptIndex + 1);
        }
      }
    } else {
      setProcessData(prev => ({
        ...prev,
        [currentPrompt.field]: text,
      }));
      
      // Automatically move to next prompt
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
        const currentPrompt = prompts[currentPromptIndex];
        transcribeMutation.mutate({ audioBlob, context: currentPrompt.context });
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone error",
        description: "Could not access your microphone.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const handleSave = () => {
    const finalData: FormData = {
      name: processData.name || "",
      description: processData.description || "",
      category: processData.category || "",
      rationale: processData.rationale || "",
      steps: processData.steps || [],
    };
    createMutation.mutate(finalData);
  };

  const currentPrompt = prompts[currentPromptIndex];
  const allFieldsFilled = processData.name && processData.description && processData.category && processData.rationale && (processData.steps?.length || 0) > 0;

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
                  idx < currentPromptIndex ? 'text-muted-foreground' : 
                  'text-muted-foreground'
                }`}
                data-testid={`prompt-item-${idx}`}
              >
                <span className="min-w-[20px]">
                  {idx < currentPromptIndex ? <Check className="h-4 w-4 text-green-500" /> : `${idx + 1}.`}
                </span>
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
          <div className="flex flex-col items-center gap-4 mb-6">
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

          {/* Editable Captured Data */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Captured Data (Editable):</p>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Process Name</label>
                <Input
                  value={processData.name || ""}
                  onChange={(e) => setProcessData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Not captured yet..."
                  data-testid="input-edit-name"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Textarea
                  value={processData.description || ""}
                  onChange={(e) => setProcessData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Not captured yet..."
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Input
                  value={processData.category || ""}
                  onChange={(e) => setProcessData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Not captured yet..."
                  data-testid="input-edit-category"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Rationale</label>
                <Textarea
                  value={processData.rationale || ""}
                  onChange={(e) => setProcessData(prev => ({ ...prev, rationale: e.target.value }))}
                  placeholder="Not captured yet..."
                  rows={3}
                  data-testid="input-edit-rationale"
                />
              </div>

              {processData.steps && processData.steps.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Steps</label>
                  <div className="space-y-2">
                    {processData.steps.map((step, idx) => (
                      <div key={step.id} className="flex gap-2 items-start">
                        <span className="text-xs mt-2">{step.stepNumber}.</span>
                        <Textarea
                          value={step.instruction}
                          onChange={(e) => {
                            const updatedSteps = [...(processData.steps || [])];
                            updatedSteps[idx] = { ...step, instruction: e.target.value };
                            setProcessData(prev => ({ ...prev, steps: updatedSteps }));
                          }}
                          rows={2}
                          data-testid={`input-edit-step-${step.id}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {allFieldsFilled && (
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending}
                className="w-full mt-4"
                data-testid="button-save-voice-process"
              >
                {createMutation.isPending ? "Saving..." : "Save Process"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Form>
  );
}
